enum SeverityLevel { small, medium, large }

class PotholeBox {
  final double x1;
  final double y1;
  final double x2;
  final double y2;
  final double confidence;
  final SeverityLevel severity;

  PotholeBox({
    required this.x1,
    required this.y1,
    required this.x2,
    required this.y2,
    required this.confidence,
    required this.severity,
  });

  double get width => (x2 - x1).clamp(0.0, 1.0);
  double get height => (y2 - y1).clamp(0.0, 1.0);
  double get normArea => width * height;

  String get severityLabel {
    switch (severity) {
      case SeverityLevel.small:
        return 'Small';
      case SeverityLevel.medium:
        return 'Medium';
      case SeverityLevel.large:
        return 'Large';
    }
  }

  static SeverityLevel computeSeverity(double normArea) {
    if (normArea < 0.01) {
      return SeverityLevel.small;
    } else if (normArea < 0.04) {
      return SeverityLevel.medium;
    } else {
      return SeverityLevel.large;
    }
  }

  Map<String, dynamic> toJson() => {
        'bbox': [x1, y1, x2, y2],
        'confidence': confidence,
        'estimated_severity': severityLabel,
        'severity_note':
            'Estimated Severity (Bounding-box area proxy; does not measure physical pothole depth)',
      };
}

class MobileInferenceResult {
  final List<PotholeBox> detections;
  final double inferenceLatencyMs;
  final double fps;
  final double? latitude;
  final double? longitude;
  final bool gpsAvailable;
  final DateTime timestamp;

  MobileInferenceResult({
    required this.detections,
    required this.inferenceLatencyMs,
    required this.fps,
    this.latitude,
    this.longitude,
    required this.gpsAvailable,
    required this.timestamp,
  });

  int get potholeCount => detections.length;

  double get avgConfidence {
    if (detections.isEmpty) return 0.0;
    final total = detections.fold(0.0, (acc, item) => acc + item.confidence);
    return total / detections.length;
  }

  String get dominantSeverity {
    if (detections.isEmpty) return 'None';
    if (detections.any((d) => d.severity == SeverityLevel.large)) return 'Large';
    if (detections.any((d) => d.severity == SeverityLevel.medium)) return 'Medium';
    return 'Small';
  }
}
