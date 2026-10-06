import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import '../models/detection_result.dart';
import '../services/onnx_inference_service.dart';
import '../services/location_service.dart';
import '../services/api_service.dart';
import '../widgets/bounding_box_painter.dart';
import '../widgets/stat_badge.dart';

class LiveCameraScreen extends StatefulWidget {
  const LiveCameraScreen({super.key});

  @override
  State<LiveCameraScreen> createState() => _LiveCameraScreenState();
}

class _LiveCameraScreenState extends State<LiveCameraScreen> {
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _isCameraReady = false;
  bool _isDetecting = false;
  bool _isProcessingFrame = false;

  List<PotholeBox> _currentDetections = [];
  double _latencyMs = 0.0;
  double _fps = 0.0;
  DateTime _lastFrameTime = DateTime.now();

  double? _latitude;
  double? _longitude;
  bool _gpsAvailable = false;

  Timer? _gpsTimer;
  Timer? _inferenceLoopTimer;

  @override
  void initState() {
    super.initState();
    _initApp();
  }

  Future<void> _initApp() async {
    // 1. Initialize ONNX
    await OnnxInferenceService.instance.initialize();

    // 2. Initialize Camera
    try {
      _cameras = await availableCameras();
      if (_cameras.isNotEmpty) {
        _cameraController = CameraController(
          _cameras[0],
          ResolutionPreset.medium,
          enableAudio: false,
          imageFormatGroup: ImageFormatGroup.jpeg,
        );
        await _cameraController!.initialize();
        if (mounted) {
          setState(() {
            _isCameraReady = true;
          });
        }
      }
    } catch (e) {
      print('Camera initialization note: $e');
    }

    // 3. Update GPS coordinates periodically
    _updateGps();
    _gpsTimer = Timer.periodic(const Duration(seconds: 10), (_) => _updateGps());
  }

  Future<void> _updateGps() async {
    final pos = await LocationService.instance.getCurrentLocation();
    if (mounted) {
      setState(() {
        if (pos != null) {
          _latitude = pos.latitude;
          _longitude = pos.longitude;
          _gpsAvailable = true;
        } else {
          _gpsAvailable = false;
        }
      });
    }
  }

  void _startDetection() {
    if (!_isCameraReady || _cameraController == null) return;
    setState(() {
      _isDetecting = true;
    });

    // Run inference loop periodically to avoid overwhelming the CPU
    // Throttled to ~4-8 FPS for optimal battery and thermals on mobile
    _inferenceLoopTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _processNextFrame();
    });
  }

  void _stopDetection() {
    _inferenceLoopTimer?.cancel();
    setState(() {
      _isDetecting = false;
      _currentDetections = [];
      _latencyMs = 0.0;
      _fps = 0.0;
    });
  }

  Future<void> _processNextFrame() async {
    if (!_isDetecting || _isProcessingFrame || _cameraController == null) return;
    if (!_cameraController!.value.isInitialized) return;

    _isProcessingFrame = true;
    final stopwatch = Stopwatch()..start();

    try {
      final XFile imageFile = await _cameraController!.takePicture();
      final Uint8List imageBytes = await imageFile.readAsBytes();

      final detections = await OnnxInferenceService.instance.inferImage(
        imageBytes,
        confThreshold: 0.25,
        iouThreshold: 0.45,
      );

      stopwatch.stop();
      final now = DateTime.now();
      final diff = now.difference(_lastFrameTime).inMilliseconds;
      final currentFps = diff > 0 ? (1000.0 / diff) : 0.0;
      _lastFrameTime = now;

      if (mounted) {
        setState(() {
          _currentDetections = detections;
          _latencyMs = stopwatch.elapsedMilliseconds.toDouble();
          _fps = currentFps.clamp(0.0, 30.0);
        });
      }

      // If potholes were detected, asynchronously sync to existing FastAPI warehouse
      if (detections.isNotEmpty) {
        ApiService.instance.syncFrameDetection(
          imageBytes: imageBytes,
          latitude: _latitude,
          longitude: _longitude,
          roadName: 'Mobile Real-Time Road',
        );
      }
    } catch (e) {
      print('Frame inference note: $e');
    } finally {
      _isProcessingFrame = false;
    }
  }

  @override
  void dispose() {
    _gpsTimer?.cancel();
    _inferenceLoopTimer?.cancel();
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F6FF), // Soft pastel blue-white
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar Banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: Colors.white,
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.shield_outlined, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'PotholeGuard Mobile',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        Text(
                          'Spot it. Map it. Fix it.',
                          style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _isDetecting ? const Color(0xFFDCFCE7) : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _isDetecting ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _isDetecting ? 'DETECTING' : 'READY',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _isDetecting ? const Color(0xFF15803D) : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Live Performance HUD Overlay
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: const Color(0xFFEFF6FF),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    StatBadge(
                      label: 'Potholes',
                      value: '${_currentDetections.length}',
                      icon: Icons.warning_amber_rounded,
                      accentColor: _currentDetections.isNotEmpty
                          ? const Color(0xFFEF4444)
                          : const Color(0xFF10B981),
                    ),
                    const SizedBox(width: 8),
                    StatBadge(
                      label: 'Avg Conf',
                      value: _currentDetections.isNotEmpty
                          ? '${((_currentDetections.fold(0.0, (acc, item) => acc + item.confidence) / _currentDetections.length) * 100).toStringAsFixed(0)}%'
                          : '—',
                      icon: Icons.verified_outlined,
                      accentColor: const Color(0xFF3B82F6),
                    ),
                    const SizedBox(width: 8),
                    StatBadge(
                      label: 'FPS',
                      value: _fps.toStringAsFixed(1),
                      icon: Icons.speed_rounded,
                      accentColor: const Color(0xFF6366F1),
                    ),
                    const SizedBox(width: 8),
                    StatBadge(
                      label: 'Latency',
                      value: '${_latencyMs.toStringAsFixed(0)} ms',
                      icon: Icons.timer_outlined,
                      accentColor: const Color(0xFFF59E0B),
                    ),
                    const SizedBox(width: 8),
                    StatBadge(
                      label: 'GPS',
                      value: _gpsAvailable ? 'ON' : 'OFF',
                      icon: Icons.location_on_outlined,
                      accentColor: _gpsAvailable ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                    ),
                  ],
                ),
              ),
            ),

            // Camera View with Bounding Box Overlay
            Expanded(
              child: Container(
                margin: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFBFDBFE), width: 1.5),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x1A3B82F6),
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (_isCameraReady && _cameraController != null)
                      CameraPreview(_cameraController!)
                    else
                      const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(color: Color(0xFF3B82F6)),
                            SizedBox(height: 12),
                            Text(
                              'Initializing camera...',
                              style: TextStyle(color: Colors.white70, fontSize: 13),
                            ),
                          ],
                        ),
                      ),

                    // Custom bounding boxes overlay
                    CustomPaint(
                      painter: BoundingBoxPainter(detections: _currentDetections),
                    ),

                    // Academic disclaimer banner inside viewport
                    Positioned(
                      bottom: 8,
                      left: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xA6000000),
                          borderRadius: BorderRadius.circular(8),
                        ),

                        child: const Text(
                          'Estimated Severity: Bounding-box area proxy; not physical depth.',
                          style: TextStyle(color: Colors.white70, fontSize: 10),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Controls Panel
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x0A000000),
                    blurRadius: 8,
                    offset: Offset(0, -2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: !_isDetecting ? _startDetection : _stopDetection,
                      icon: Icon(
                        _isDetecting ? Icons.stop_rounded : Icons.play_arrow_rounded,
                        size: 22,
                      ),
                      label: Text(
                        _isDetecting ? 'STOP DETECTION' : 'START DETECTION',
                        style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _isDetecting ? const Color(0xFFEF4444) : const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
