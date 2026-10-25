import 'package:flutter_test/flutter_test.dart';
import 'package:job_radar/shared/formatting/app_formatters.dart';

void main() {
  test('formats salary ranges', () {
    expect(
      AppFormatters.salary(minimum: 100000, maximum: 150000, currency: 'KES'),
      '100,000 – 150,000 KES',
    );
  });

  test('identifies undisclosed salary', () {
    expect(
      AppFormatters.salary(minimum: 0, maximum: 0, currency: 'KES'),
      'Salary not disclosed',
    );
  });
}
