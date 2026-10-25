import 'package:flutter/foundation.dart';

import '../data/follow_up_repository.dart';
import '../domain/follow_up.dart';

enum FollowUpLoadState { idle, loading, ready, error }

class FollowUpController extends ChangeNotifier {
  FollowUpController({required FollowUpRepository repository})
    : _repository = repository;

  final FollowUpRepository _repository;

  FollowUpLoadState _state = FollowUpLoadState.idle;
  List<FollowUp> _items = const [];
  String? _errorMessage;

  FollowUpLoadState get state => _state;
  List<FollowUp> get items => _items;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = FollowUpLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _items = await _repository.listFollowUps();
      _state = FollowUpLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = FollowUpLoadState.error;
    }
    notifyListeners();
  }

  Future<bool> schedule({
    required String applicationId,
    required DateTime dueAt,
    String note = '',
  }) async {
    try {
      final followUp = await _repository.schedule(
        applicationId: applicationId,
        dueAt: dueAt,
        note: note,
      );
      _items = [..._items, followUp]
        ..sort((a, b) => a.dueAt.compareTo(b.dueAt));
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> markDone(FollowUp followUp) async {
    try {
      final updated = await _repository.updateStatus(followUp, status: 'SENT');
      _items = [
        for (final item in _items)
          if (item.id == updated.id) updated else item,
      ];
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return false;
    }
  }
}
