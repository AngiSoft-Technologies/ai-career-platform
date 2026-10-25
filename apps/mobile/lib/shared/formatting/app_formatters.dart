import 'package:intl/intl.dart';

class AppFormatters {
  const AppFormatters._();

  static String date(DateTime? value) {
    if (value == null) return 'Not set';
    return DateFormat.yMMMd().format(value.toLocal());
  }

  static String dateTime(DateTime? value) {
    if (value == null) return 'Not set';
    return DateFormat.yMMMd().add_jm().format(value.toLocal());
  }

  static String relativeDate(DateTime? value) {
    if (value == null) return 'Recently';
    final difference = DateTime.now().difference(value.toLocal());
    if (difference.inMinutes < 60) return '${difference.inMinutes}m ago';
    if (difference.inHours < 24) return '${difference.inHours}h ago';
    if (difference.inDays < 7) return '${difference.inDays}d ago';
    return date(value);
  }

  static String salary({
    required int? minimum,
    required int? maximum,
    required String? currency,
  }) {
    if ((minimum ?? 0) == 0 && (maximum ?? 0) == 0) {
      return 'Salary not disclosed';
    }
    final unit = currency == null || currency.isEmpty ? '' : ' $currency';
    if (minimum == null || minimum == 0) {
      return 'Up to ${_number(maximum)}$unit';
    }
    if (maximum == null || maximum == 0 || maximum == minimum) {
      return '${_number(minimum)}$unit';
    }
    return '${_number(minimum)} – ${_number(maximum)}$unit';
  }

  static String compactNumber(int value) {
    return NumberFormat.compact().format(value);
  }

  static String _number(int? value) {
    return NumberFormat.decimalPattern().format(value ?? 0);
  }
}
