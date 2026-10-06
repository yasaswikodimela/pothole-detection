import 'package:flutter_test/flutter_test.dart';
import 'package:pothole_guard/main.dart';

void main() {
  testWidgets('PotholeGuard app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const PotholeGuardApp());
    expect(find.byType(PotholeGuardApp), findsOneWidget);
  });
}
