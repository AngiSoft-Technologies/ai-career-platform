import 'package:flutter/foundation.dart';

import '../data/company_repository.dart';
import '../domain/company.dart';

enum CompaniesLoadState { idle, loading, ready, error }

enum CompanyDetailState { idle, loading, ready, error }

/// Drives the companies browser.
///
/// Mirrors the web page's behaviour: the list loads once and is filtered
/// in memory as the candidate types, which keeps a search responsive
/// without a request per keystroke — the catalogue is not large, and the
/// alternative spends the candidate's data on it.
class CompaniesController extends ChangeNotifier {
  CompaniesController({required CompanyRepository repository})
    : _repository = repository;

  final CompanyRepository _repository;

  CompaniesLoadState _listState = CompaniesLoadState.idle;
  CompanyDetailState _detailState = CompanyDetailState.idle;

  List<Company> _all = const [];
  String _search = '';
  String? _errorMessage;

  CompanyDetail? _detail;
  String? _detailError;

  CompaniesLoadState get listState => _listState;
  CompanyDetailState get detailState => _detailState;
  List<Company> get companies => _filtered();
  String get search => _search;
  String? get errorMessage => _errorMessage;
  CompanyDetail? get detail => _detail;
  String? get detailError => _detailError;

  Future<void> load() async {
    if (_listState == CompaniesLoadState.loading) return;
    _listState = CompaniesLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _all = await _repository.companies();
      _listState = CompaniesLoadState.ready;
    } catch (error) {
      _errorMessage = 'Could not load companies. Pull to retry.';
      _listState = CompaniesLoadState.error;
    }
    notifyListeners();
  }

  /// The list is filtered in memory: a search box that requests on every
  /// keystroke spends the candidate's data on the catalogue, and the
  /// catalogue is not large.
  void updateSearch(String value) {
    _search = value;
    notifyListeners();
  }

  Future<void> open(String slug) async {
    _detailState = CompanyDetailState.loading;
    _detail = null;
    _detailError = null;
    notifyListeners();
    try {
      _detail = await _repository.company(slug);
      _detailState = CompanyDetailState.ready;
    } catch (error) {
      // ApiException's own toString is the message, so it reads as
      // English rather than "Instance of 'ApiException'".
      _detailError = error.toString();
      _detailState = CompanyDetailState.error;
    }
    notifyListeners();
  }

  void closeDetail() {
    _detail = null;
    _detailState = CompanyDetailState.idle;
    _detailError = null;
    notifyListeners();
  }

  List<Company> _filtered() {
    final needle = _search.trim().toLowerCase();
    if (needle.isEmpty) return _all;
    return _all
        .where(
          (company) =>
              company.name.toLowerCase().contains(needle) ||
              (company.industry ?? '').toLowerCase().contains(needle) ||
              (company.country ?? '').toLowerCase().contains(needle),
        )
        .toList();
  }
}
