import 'package:flutter/material.dart';
import '../models/detection_result.dart';

class BoundingBoxPainter extends CustomPainter {
  final List<PotholeBox> detections;
  final Size? sourceImageSize;

  BoundingBoxPainter({
    required this.detections,
    this.sourceImageSize,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (detections.isEmpty) return;

    for (int i = 0; i < detections.length; i++) {
      final det = detections[i];

      // Normalized coordinates [0.0..1.0] scaled to render canvas size
      final double left = det.x1 * size.width;
      final double top = det.y1 * size.height;
      final double right = det.x2 * size.width;
      final double bottom = det.y2 * size.height;
      final double width = right - left;
      final double height = bottom - top;

      final rect = Rect.fromLTWH(left, top, width, height);

      // Box Outline
      final boxPaint = Paint()
        ..color = const Color(0xFFEF4444)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.0;

      // Subtle fill
      final fillPaint = Paint()
        ..color = const Color(0x33EF4444)
        ..style = PaintingStyle.fill;

      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(6)), fillPaint);
      canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(6)), boxPaint);

      // Label background & text
      final text = '#${i + 1} Pothole ${(det.confidence * 100).toStringAsFixed(0)}% (${det.severityLabel})';
      final textSpan = TextSpan(
        text: text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.2,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      )..layout();

      final labelTop = (top - 20) < 0 ? top : (top - 20);
      final labelRect = Rect.fromLTWH(
        left,
        labelTop,
        textPainter.width + 10,
        18,
      );

      final labelBgPaint = Paint()
        ..color = const Color(0xEEEF4444)
        ..style = PaintingStyle.fill;

      canvas.drawRRect(RRect.fromRectAndRadius(labelRect, const Radius.circular(4)), labelBgPaint);
      textPainter.paint(canvas, Offset(left + 5, labelTop + 1.5));
    }
  }

  @override
  bool shouldRepaint(covariant BoundingBoxPainter oldDelegate) {
    return oldDelegate.detections != detections;
  }
}
