import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../models/detection_result.dart';
import '../services/onnx_inference_service.dart';
import '../services/location_service.dart';
import '../services/api_service.dart';
import '../widgets/bounding_box_painter.dart';

class ImageDetectScreen extends StatefulWidget {
  const ImageDetectScreen({super.key});

  @override
  State<ImageDetectScreen> createState() => _ImageDetectScreenState();
}

class _ImageDetectScreenState extends State<ImageDetectScreen> {
  final ImagePicker _picker = ImagePicker();
  Uint8List? _imageBytes;
  List<PotholeBox> _detections = [];
  bool _isLoading = false;
  double _latencyMs = 0.0;
  String? _statusMessage;


  final TextEditingController _roadController = TextEditingController(text: 'Mobile Image Road');

  Future<void> _pickAndDetect() async {
    final XFile? file = await _picker.pickImage(source: ImageSource.gallery);
    if (file == null) return;

    setState(() {
      _isLoading = true;
      _detections = [];
      _statusMessage = 'Running ONNX inference on device...';
    });

    final bytes = await file.readAsBytes();
    final stopwatch = Stopwatch()..start();

    // 1. Run on-device ONNX inference
    final results = await OnnxInferenceService.instance.inferImage(
      bytes,
      confThreshold: 0.25,
      iouThreshold: 0.45,
    );
    stopwatch.stop();

    setState(() {
      _imageBytes = bytes;
      _detections = results;

      _latencyMs = stopwatch.elapsedMilliseconds.toDouble();
      _isLoading = false;
      _statusMessage = results.isEmpty
          ? 'No potholes detected in this image.'
          : 'Detected ${results.length} pothole(s) in ${_latencyMs.toStringAsFixed(0)} ms.';
    });

    // 2. Sync record to SQLite warehouse if potholes were found
    if (results.isNotEmpty) {
      final pos = await LocationService.instance.getCurrentLocation();
      await ApiService.instance.syncFrameDetection(
        imageBytes: bytes,
        latitude: pos?.latitude,
        longitude: pos?.longitude,
        roadName: _roadController.text,
      );
    }
  }

  @override
  void dispose() {
    _roadController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F6FF),
      appBar: AppBar(
        title: const Text(
          'Image Detection',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: Color(0xFF0F172A)),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Image container with overlay
              Container(
                height: 320,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFDBEAFE), width: 1.5),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0E3B82F6),
                      blurRadius: 10,
                      offset: Offset(0, 3),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: _imageBytes == null
                    ? InkWell(
                        onTap: _pickAndDetect,
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate_outlined, size: 52, color: Color(0xFF3B82F6)),
                            SizedBox(height: 12),
                            Text(
                              'Tap to pick road image from gallery',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF3B82F6)),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'Runs YOLOv8s ONNX model on device',
                              style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                            ),
                          ],
                        ),
                      )
                    : Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.memory(
                            _imageBytes!,
                            fit: BoxFit.contain,
                          ),
                          CustomPaint(
                            painter: BoundingBoxPainter(detections: _detections),
                          ),
                        ],
                      ),
              ),
              const SizedBox(height: 12),

              // Road name input
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFDBEAFE)),
                ),
                child: TextField(
                  controller: _roadController,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    icon: Icon(Icons.edit_road_rounded, size: 20, color: Color(0xFF3B82F6)),
                    hintText: 'Road Name (e.g., MG Road)',
                    hintStyle: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                  ),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(height: 12),

              // Action button
              ElevatedButton.icon(
                onPressed: _isLoading ? null : _pickAndDetect,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: Text(_isLoading ? 'Processing...' : 'CHOOSE IMAGE & DETECT'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
              ),
              if (_statusMessage != null) ...[
                const SizedBox(height: 8),
                Text(
                  _statusMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
              ],
              const SizedBox(height: 16),

              // Results card

              if (_imageBytes != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFDBEAFE)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x0A3B82F6),
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Detection Summary',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _detections.isNotEmpty ? const Color(0xFFFEE2E2) : const Color(0xFFDCFCE7),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _detections.isNotEmpty ? 'POTHOLES FOUND' : 'CLEAR ROAD',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: _detections.isNotEmpty ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 20, color: Color(0xFFF1F5F9)),
                      _buildRow('Pothole Count', '${_detections.length}'),
                      _buildRow(
                        'Average Confidence',
                        _detections.isNotEmpty
                            ? '${((_detections.fold(0.0, (acc, item) => acc + item.confidence) / _detections.length) * 100).toStringAsFixed(1)}%'
                            : 'N/A',
                      ),
                      _buildRow('On-Device Latency', '${_latencyMs.toStringAsFixed(0)} ms'),
                      _buildRow(
                        'Estimated Severity',
                        _detections.isNotEmpty ? _detections[0].severityLabel : 'None',
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'Estimated Severity: Bounding-box area proxy; not physical pothole depth.',
                          style: TextStyle(fontSize: 10, color: Color(0xFF92400E)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
        ],
      ),
    );
  }
}
