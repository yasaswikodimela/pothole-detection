import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';


class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  // Default for Android Emulator; can be updated dynamically
  String _baseUrl = 'http://10.0.2.2:8000';

  String get baseUrl => _baseUrl;

  void setBaseUrl(String url) {
    var trimmed = url.trim();
    if (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    _baseUrl = trimmed;
  }

  Future<bool> checkHealth() async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/health'))
          .timeout(const Duration(seconds: 4));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Send detection frame result to FastAPI backend / SQLite warehouse
  Future<Map<String, dynamic>?> syncFrameDetection({
    required Uint8List imageBytes,
    double? latitude,
    double? longitude,
    String? roadName,
  }) async {
    try {
      final base64Image = base64Encode(imageBytes);
      final body = jsonEncode({
        'image_base64': base64Image,
        'latitude': latitude,
        'longitude': longitude,
        'road_name': roadName ?? 'Mobile Survey',
        'device': 'android_mobile_onnx',
      });

      final response = await http
          .post(
            Uri.parse('$_baseUrl/detect/frame'),
            headers: {'Content-Type': 'application/json'},
            body: body,
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      return null;
    } catch (e) {
      print('ApiService syncFrameDetection note: $e');
      return null;
    }
  }

  /// Upload an image to the backend /detect/image endpoint
  Future<Map<String, dynamic>?> uploadImage({
    required Uint8List imageBytes,
    required String filename,
    double? latitude,
    double? longitude,
    String? roadName,
  }) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$_baseUrl/detect/image'),
      );

      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          imageBytes,
          filename: filename,
          contentType: MediaType('image', 'jpeg'),
        ),
      );

      if (roadName != null && roadName.isNotEmpty) {
        request.fields['road_name'] = roadName;
      }
      if (latitude != null) {
        request.fields['latitude'] = latitude.toString();
      }
      if (longitude != null) {
        request.fields['longitude'] = longitude.toString();
      }

      final streamedResponse = await request.send().timeout(const Duration(seconds: 25));
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      return null;
    } catch (e) {
      print('ApiService uploadImage note: $e');
      return null;
    }
  }

  /// Fetch detection history from data warehouse
  Future<List<Map<String, dynamic>>> fetchHistory({int limit = 30}) async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/detections?limit=$limit'))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final list = data['data'] ?? data['detections'] ?? [];
        return List<Map<String, dynamic>>.from(list);
      }
      return [];
    } catch (e) {
      print('ApiService fetchHistory note: $e');
      return [];
    }
  }

  /// Fetch model evaluation metrics
  Future<Map<String, dynamic>?> fetchModelMetrics() async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/model/metrics'))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}
