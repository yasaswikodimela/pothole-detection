import 'dart:typed_data';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:onnxruntime/onnxruntime.dart';
import '../models/detection_result.dart';

class OnnxInferenceService {
  static final OnnxInferenceService instance = OnnxInferenceService._internal();
  OnnxInferenceService._internal();

  OrtSession? _session;
  bool _isInitialized = false;
  bool _isLoading = false;

  bool get isReady => _isInitialized && _session != null;

  Future<void> initialize() async {
    if (_isInitialized || _isLoading) return;
    _isLoading = true;

    try {
      OrtEnv.instance.init();
      final rawAsset = await rootBundle.load('assets/models/best.onnx');
      final bytes = rawAsset.buffer.asUint8List();
      final sessionOptions = OrtSessionOptions();
      _session = OrtSession.fromBuffer(bytes, sessionOptions);
      _isInitialized = true;
      print('PotholeGuard: ONNX YOLOv8s Model loaded successfully!');
    } catch (e) {
      print('PotholeGuard: ONNX load note / fallback: $e');
      _isInitialized = false;
    } finally {
      _isLoading = false;
    }
  }

  /// Run YOLOv8s ONNX inference on image bytes (JPEG / PNG / camera raw)
  Future<List<PotholeBox>> inferImage(Uint8List imageBytes, {
    double confThreshold = 0.25,
    double iouThreshold = 0.45,
  }) async {
    if (!_isInitialized || _session == null) {
      await initialize();
      if (_session == null) {
        return [];
      }
    }

    final decoded = img.decodeImage(imageBytes);
    if (decoded == null) return [];

    // 1. Resize to YOLOv8 input size 640x640
    final resized = img.copyResize(decoded, width: 640, height: 640);

    // 2. Normalize to CHW float32 [1, 3, 640, 640]
    final floatList = Float32List(1 * 3 * 640 * 640);
    int rOffset = 0;
    int gOffset = 640 * 640;
    int bOffset = 2 * 640 * 640;

    for (int y = 0; y < 640; y++) {
      for (int x = 0; x < 640; x++) {
        final pixel = resized.getPixel(x, y);
        final pixelIndex = y * 640 + x;
        floatList[rOffset + pixelIndex] = pixel.r / 255.0;
        floatList[gOffset + pixelIndex] = pixel.g / 255.0;
        floatList[bOffset + pixelIndex] = pixel.b / 255.0;
      }
    }

    // 3. Create input tensor
    final inputTensor = OrtValueTensor.createTensorWithDataList(
      floatList,
      [1, 3, 640, 640],
    );

    final runOptions = OrtRunOptions();
    final outputs = _session!.run(runOptions, {'images': inputTensor});
    inputTensor.release();
    runOptions.release();

    if (outputs.isEmpty || outputs[0] == null) return [];

    // Output shape is [1, 5, 8400]
    final rawOutput = outputs[0]!.value as List;
    final List candidateBoxes = [];

    // Process output tensor
    // 5 channels: 0:xc, 1:yc, 2:w, 3:h, 4:conf
    final List<dynamic> batch0 = rawOutput[0]; // [5, 8400]
    final List<dynamic> xs = batch0[0];
    final List<dynamic> ys = batch0[1];
    final List<dynamic> ws = batch0[2];
    final List<dynamic> hs = batch0[3];
    final List<dynamic> confs = batch0[4];

    final int numAnchors = confs.length;

    for (int i = 0; i < numAnchors; i++) {
      final double conf = (confs[i] as num).toDouble();
      if (conf >= confThreshold) {
        final double xc = (xs[i] as num).toDouble();
        final double yc = (ys[i] as num).toDouble();
        final double w = (ws[i] as num).toDouble();
        final double h = (hs[i] as num).toDouble();

        // Convert coordinates from 640x640 pixel space to 0..1 normalized space
        final double x1 = ((xc - w / 2.0) / 640.0).clamp(0.0, 1.0);
        final double y1 = ((yc - h / 2.0) / 640.0).clamp(0.0, 1.0);
        final double x2 = ((xc + w / 2.0) / 640.0).clamp(0.0, 1.0);
        final double y2 = ((yc + h / 2.0) / 640.0).clamp(0.0, 1.0);

        final double normArea = (x2 - x1) * (y2 - y1);
        final severity = PotholeBox.computeSeverity(normArea);

        candidateBoxes.add(PotholeBox(
          x1: x1,
          y1: y1,
          x2: x2,
          y2: y2,
          confidence: conf,
          severity: severity,
        ));
      }
    }

    // Release outputs
    for (final element in outputs) {
      element?.release();
    }

    // 4. Apply Non-Maximum Suppression (NMS)
    return _applyNms(candidateBoxes.cast<PotholeBox>(), iouThreshold);
  }

  /// Non-Maximum Suppression (NMS)
  List<PotholeBox> _applyNms(List<PotholeBox> boxes, double iouThreshold) {
    if (boxes.isEmpty) return [];

    // Sort by confidence descending
    boxes.sort((a, b) => b.confidence.compareTo(a.confidence));

    final List<PotholeBox> selected = [];
    final List<bool> suppressed = List.filled(boxes.length, false);

    for (int i = 0; i < boxes.length; i++) {
      if (suppressed[i]) continue;
      final current = boxes[i];
      selected.add(current);

      for (int j = i + 1; j < boxes.length; j++) {
        if (suppressed[j]) continue;
        if (_calculateIou(current, boxes[j]) > iouThreshold) {
          suppressed[j] = true;
        }
      }
    }

    return selected;
  }

  double _calculateIou(PotholeBox a, PotholeBox b) {
    final double interX1 = max(a.x1, b.x1);
    final double interY1 = max(a.y1, b.y1);
    final double interX2 = min(a.x2, b.x2);
    final double interY2 = min(a.y2, b.y2);

    final double interW = max(0.0, interX2 - interX1);
    final double interH = max(0.0, interY2 - interY1);
    final double interArea = interW * interH;

    final double areaA = a.normArea;
    final double areaB = b.normArea;
    final double unionArea = areaA + areaB - interArea;

    if (unionArea <= 0.0) return 0.0;
    return interArea / unionArea;
  }
}
