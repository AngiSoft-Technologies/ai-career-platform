import 'dart:convert';

import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../synchronization/offline_action.dart';

class LocalDatabase {
  LocalDatabase._(this._database);

  final Database _database;

  static Future<LocalDatabase> open() async {
    final directory = await getApplicationDocumentsDirectory();
    final databasePath = path.join(directory.path, 'job_radar.sqlite');
    final database = await openDatabase(
      databasePath,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE recent_opportunities (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE saved_opportunities (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            saved_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE candidate_profile (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE preferences (
            id INTEGER PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE applications (
            id TEXT PRIMARY KEY,
            opportunity_id TEXT NOT NULL,
            status TEXT NOT NULL,
            version INTEGER NOT NULL,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE application_status (
            application_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            version INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            opportunity_id TEXT NOT NULL,
            application_id TEXT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE notifications (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            type TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            json TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE followups (
            id TEXT PRIMARY KEY,
            application_id TEXT NOT NULL,
            due_at TEXT NOT NULL,
            status TEXT NOT NULL,
            note TEXT NOT NULL,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE offline_actions (
            idempotency_key TEXT PRIMARY KEY,
            action_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_error TEXT
          )
        ''');
      },
    );
    return LocalDatabase._(database);
  }

  Future<void> cacheOpportunity(Map<String, dynamic> opportunity) async {
    final id = opportunity['id']! as String;
    await _database.insert('recent_opportunities', {
      'id': id,
      'json': jsonEncode(opportunity),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> recentOpportunities() async {
    final rows = await _database.query(
      'recent_opportunities',
      orderBy: 'updated_at DESC',
      limit: 100,
    );
    return rows.map(_decodeMap).toList();
  }

  Future<void> saveOpportunity(Map<String, dynamic> opportunity) async {
    final id = opportunity['id']! as String;
    await _database.insert('saved_opportunities', {
      'id': id,
      'json': jsonEncode(opportunity),
      'saved_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> removeSavedOpportunity(String id) async {
    await _database.delete(
      'saved_opportunities',
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<bool> isOpportunitySaved(String id) async {
    final rows = await _database.query(
      'saved_opportunities',
      columns: ['id'],
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isNotEmpty;
  }

  Future<Set<String>> savedOpportunityIds() async {
    final rows = await _database.query('saved_opportunities', columns: ['id']);
    return rows.map((row) => row['id']! as String).toSet();
  }

  Future<List<Map<String, dynamic>>> savedOpportunities() async {
    final rows = await _database.query(
      'saved_opportunities',
      orderBy: 'saved_at DESC',
    );
    return rows.map(_decodeMap).toList();
  }

  Future<void> cacheProfile(Map<String, dynamic> profile) async {
    await _database.insert('candidate_profile', {
      'id': 'candidate',
      'json': jsonEncode(profile),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> cachedProfile() async {
    final rows = await _database.query(
      'candidate_profile',
      where: 'id = ?',
      whereArgs: ['candidate'],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  Future<void> cachePreferences(Map<String, dynamic> preferences) async {
    await _database.insert('preferences', {
      'id': 1,
      'json': jsonEncode(preferences),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> cachedPreferences() async {
    final rows = await _database.query(
      'preferences',
      where: 'id = ?',
      whereArgs: [1],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  Future<void> cacheApplication(Map<String, dynamic> application) async {
    final id = application['id']! as String;
    final now = _now;
    await _database.transaction((transaction) async {
      await transaction.insert('applications', {
        'id': id,
        'opportunity_id': application['opportunityId'],
        'status': application['status'],
        'version': application['version'],
        'json': jsonEncode(application),
        'updated_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
      await transaction.insert('application_status', {
        'application_id': id,
        'status': application['status'],
        'version': application['version'],
        'updated_at': now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    });
  }

  Future<void> remapLocalApplicationId(
    String localId,
    Map<String, dynamic> serverApplication,
  ) async {
    final serverId = serverApplication['id'] as String?;
    if (serverId == null || serverId.isEmpty || localId == serverId) return;
    await cacheApplication(serverApplication);
    await _database.transaction((transaction) async {
      await transaction.delete(
        'applications',
        where: 'id = ?',
        whereArgs: [localId],
      );
      await transaction.delete(
        'application_status',
        where: 'application_id = ?',
        whereArgs: [localId],
      );
      final followups = await transaction.query(
        'followups',
        where: 'application_id = ?',
        whereArgs: [localId],
      );
      for (final row in followups) {
        final json = _decodeMap(row)..['applicationId'] = serverId;
        await transaction.update(
          'followups',
          {'application_id': serverId, 'json': jsonEncode(json)},
          where: 'id = ?',
          whereArgs: [row['id']],
        );
      }
    });
    await replacePendingActionReference(localId, serverId);
  }

  Future<void> remapLocalFollowUpId(String localId, String serverId) async {
    if (localId == serverId) return;
    await _database.transaction((transaction) async {
      final rows = await transaction.query(
        'followups',
        where: 'id = ?',
        whereArgs: [localId],
        limit: 1,
      );
      if (rows.isNotEmpty) {
        final row = rows.first;
        final json = _decodeMap(row)..['id'] = serverId;
        await transaction.delete(
          'followups',
          where: 'id = ?',
          whereArgs: [localId],
        );
        await transaction.insert('followups', {
          ...row,
          'id': serverId,
          'json': jsonEncode(json),
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
    await replacePendingActionReference(localId, serverId);
  }

  Future<void> replacePendingActionReference(String oldId, String newId) async {
    final rows = await _database.query(
      'offline_actions',
      where: 'status = ?',
      whereArgs: ['pending'],
    );
    for (final row in rows) {
      final payload = jsonDecode(row['payload']! as String);
      final rewritten = _replaceId(payload, oldId, newId);
      await _database.update(
        'offline_actions',
        {'payload': jsonEncode(rewritten), 'updated_at': _now},
        where: 'idempotency_key = ?',
        whereArgs: [row['idempotency_key']],
      );
    }
  }

  Future<List<Map<String, dynamic>>> cachedApplications() async {
    final rows = await _database.query(
      'applications',
      orderBy: 'updated_at DESC',
    );
    return rows.map(_decodeMap).toList();
  }

  Future<Map<String, dynamic>?> cachedApplication(String id) async {
    final rows = await _database.query(
      'applications',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  Future<void> cacheDocument(Map<String, dynamic> document) async {
    await _database.insert('documents', {
      'id': document['id'],
      'opportunity_id': document['opportunityId'],
      'application_id': document['applicationId'],
      'type': document['type'],
      'title': document['title'],
      'content': document['content'],
      'json': jsonEncode(document),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> cachedDocuments() async {
    final rows = await _database.query('documents', orderBy: 'updated_at DESC');
    return rows.map(_decodeMap).toList();
  }

  Future<Map<String, dynamic>?> cachedDocument(String id) async {
    final rows = await _database.query(
      'documents',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  Future<void> cacheNotification(Map<String, dynamic> notification) async {
    await _database.insert('notifications', {
      'id': notification['id'],
      'title': notification['title'],
      'body': notification['body'],
      'type': notification['type'],
      'is_read': notification['isRead'] == true ? 1 : 0,
      'json': jsonEncode(notification),
      'created_at':
          DateTime.tryParse(notification['createdAt'] as String? ?? '')
              ?.millisecondsSinceEpoch ??
          _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> cachedNotifications() async {
    final rows = await _database.query(
      'notifications',
      orderBy: 'created_at DESC',
    );
    return rows.map(_decodeMap).toList();
  }

  Future<void> markAllNotificationsRead() async {
    final notifications = await cachedNotifications();
    final batch = _database.batch();
    for (final notification in notifications) {
      final id = notification['id']! as String;
      final updated = Map<String, dynamic>.from(notification)
        ..['isRead'] = true;
      batch.insert('notifications', {
        'id': id,
        'title': updated['title'],
        'body': updated['body'],
        'type': updated['type'],
        'is_read': 1,
        'json': jsonEncode(updated),
        'created_at':
            DateTime.tryParse(updated['createdAt'] as String? ?? '')
                ?.millisecondsSinceEpoch ??
            _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<int> unreadNotificationCount() async {
    final rows = await _database.rawQuery(
      'SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0',
    );
    return (rows.first['count'] as int?) ?? 0;
  }

  Future<void> cacheFollowUp(Map<String, dynamic> followUp) async {
    await _database.insert('followups', {
      'id': followUp['id'],
      'application_id': followUp['applicationId'],
      'due_at': followUp['dueAt'],
      'status': followUp['status'],
      'note': followUp['note'],
      'json': jsonEncode(followUp),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> cachedFollowUps() async {
    final rows = await _database.query('followups', orderBy: 'due_at ASC');
    return rows.map(_decodeMap).toList();
  }

  Future<void> enqueueAction(OfflineAction action) async {
    await _database.insert('offline_actions', {
      'idempotency_key': action.idempotencyKey,
      'action_type': action.actionType,
      'payload': jsonEncode(action.payload),
      'status': action.status,
      'created_at': action.createdAt.millisecondsSinceEpoch,
      'updated_at': action.updatedAt.millisecondsSinceEpoch,
      'last_error': action.lastError,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<OfflineAction>> pendingActions() async {
    final rows = await _database.query(
      'offline_actions',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
    );
    return rows.map(OfflineAction.fromRow).toList();
  }

  Future<void> updateAction(
    String idempotencyKey, {
    required String status,
    String? error,
  }) async {
    await _database.update(
      'offline_actions',
      {'status': status, 'updated_at': _now, 'last_error': error},
      where: 'idempotency_key = ?',
      whereArgs: [idempotencyKey],
    );
  }

  Future<int> actionCount({String? status}) async {
    final rows = status == null
        ? await _database.rawQuery(
            'SELECT COUNT(*) AS count FROM offline_actions',
          )
        : await _database.rawQuery(
            'SELECT COUNT(*) AS count FROM offline_actions WHERE status = ?',
            [status],
          );
    return (rows.first['count'] as int?) ?? 0;
  }

  Map<String, dynamic> _decodeMap(Map<String, Object?> row) {
    final decoded = jsonDecode(row['json']! as String);
    return Map<String, dynamic>.from(decoded as Map);
  }

  dynamic _replaceId(dynamic value, String oldId, String newId) {
    if (value is String) return value == oldId ? newId : value;
    if (value is List) {
      return value.map((item) => _replaceId(item, oldId, newId)).toList();
    }
    if (value is Map) {
      return value.map(
        (key, item) => MapEntry(key, _replaceId(item, oldId, newId)),
      );
    }
    return value;
  }

  int get _now => DateTime.now().millisecondsSinceEpoch;
}
