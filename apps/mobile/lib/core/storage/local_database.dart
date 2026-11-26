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
    final databasePath = path.join(directory.path, 'mboqara.sqlite');
    Future<void> createV1(Database db) async {
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
          CREATE TABLE companies (
            id TEXT PRIMARY KEY,
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
    }

    Future<void> createV2(Database db) async {
      await db.execute('''
          CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      await db.execute('''
          CREATE TABLE IF NOT EXISTS entity_sync_state (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            sync_status TEXT NOT NULL,
            server_version INTEGER,
            local_updated_at INTEGER NOT NULL,
            server_updated_at INTEGER,
            last_error TEXT,
            PRIMARY KEY (entity_type, entity_id)
          )
        ''');
      await db.execute('''
          CREATE TABLE IF NOT EXISTS saved_searches (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      await db.execute('''
          CREATE TABLE IF NOT EXISTS job_alerts (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      // Add retry/conflict columns to offline_actions if missing
      for (final col in [
        'retry_count INTEGER NOT NULL DEFAULT 0',
        'entity_type TEXT',
        'entity_id TEXT',
        'next_retry_at INTEGER',
      ]) {
        try {
          await db.execute('ALTER TABLE offline_actions ADD COLUMN $col');
        } catch (_) {}
      }
    }

    // V3 adds a namespaced query cache, cached match/company detail, and
    // conflict metadata on the outbox. Migrations are additive so an install
    // that already has a populated cache keeps all of its rows.
    Future<void> createV3(Database db) async {
      await db.execute('''
          CREATE TABLE IF NOT EXISTS query_cache (
            cache_key TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      await db.execute('''
          CREATE TABLE IF NOT EXISTS cached_matches (
            id TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      await db.execute('''
          CREATE TABLE IF NOT EXISTS cached_company_details (
            slug TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      for (final column in [
        'server_version INTEGER',
        'server_updated_at INTEGER',
        'conflict_resolution TEXT',
        'server_payload TEXT',
      ]) {
        try {
          await db.execute('ALTER TABLE offline_actions ADD COLUMN $column');
        } catch (_) {
          // The column already exists (fresh V3 databases are created with it
          // by the earlier CREATE TABLE plus these no-op alterations).
        }
      }
      await db.execute(
        'CREATE INDEX IF NOT EXISTS offline_actions_status_idx '
        'ON offline_actions (status, next_retry_at)',
      );
    }

    final database = await openDatabase(
      databasePath,
      version: 3,
      onCreate: (db, version) async {
        await createV1(db);
        await createV2(db);
        await createV3(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await createV2(db);
        }
        if (oldVersion < 3) {
          await createV3(db);
        }
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

  /// The companies list, cached under one row. It is browsable content,
  /// so it is worth keeping the last good copy of it the way the rest of
  /// the app keeps what a candidate has already read.
  Future<void> cacheCompanies(List<Map<String, dynamic>> companies) async {
    await _database.insert('companies', {
      'id': 'companies-list',
      'json': jsonEncode({'companies': companies}),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> cachedCompanies() async {
    final rows = await _database.query(
      'companies',
      where: 'id = ?',
      whereArgs: ['companies-list'],
      limit: 1,
    );
    if (rows.isEmpty) return const [];
    final decoded = _decodeMap(rows.first)['companies'];
    if (decoded is List) {
      return decoded.whereType<Map<String, dynamic>>().toList();
    }
    return const [];
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

  /// Replaces the local notification cache with the server's list.
  ///
  /// The server is the source of truth for notifications, so a full replace is
  /// correct: a notification deleted or read on another device must not
  /// survive locally.
  Future<void> replaceNotifications(
    List<Map<String, dynamic>> notifications,
  ) async {
    final batch = _database.batch();
    batch.delete('notifications');
    for (final notification in notifications) {
      final createdAt =
          DateTime.tryParse(notification['createdAt'] as String? ?? '')
              ?.millisecondsSinceEpoch ??
          _now;
      batch.insert('notifications', {
        'id': notification['id'],
        'title': notification['title'] ?? '',
        'body': notification['body'] ?? '',
        'type': notification['type'] ?? 'general',
        'is_read': notification['isRead'] == true ? 1 : 0,
        'json': jsonEncode(notification),
        'created_at': createdAt,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
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
      'retry_count': action.retryCount,
      'entity_type': action.entityType,
      'entity_id': action.entityId,
      'next_retry_at': action.nextRetryAt?.millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    if (action.entityType != null && action.entityId != null) {
      await setEntitySyncState(action.entityType!, action.entityId!, 'pending');
    }
  }

  Future<List<OfflineAction>> pendingActions() async {
    final now = _now;
    final rows = await _database.query(
      'offline_actions',
      where: "(status = 'pending' OR status = 'failed') AND (next_retry_at IS NULL OR next_retry_at <= ?)",
      whereArgs: [now],
      orderBy: 'created_at ASC',
    );
    return rows.map(OfflineAction.fromRow).toList();
  }

  Future<void> setSyncMetadata(String key, String value) async {
    await _database.insert('sync_metadata', {
      'key': key,
      'value': value,
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<String?> getSyncMetadata(String key) async {
    final rows = await _database.query(
      'sync_metadata',
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return rows.first['value'] as String?;
  }

  Future<void> setEntitySyncState(
    String entityType,
    String entityId,
    String syncStatus, {
    int? serverVersion,
    DateTime? serverUpdatedAt,
    String? lastError,
  }) async {
    // Replace used to write `server_updated_at: null` unconditionally, which
    // threw away the server timestamp on every status-only transition. Read
    // the existing row first so an absent argument means "keep what we know".
    final existing = await getEntitySyncState(entityType, entityId);
    final previousVersion = existing?['server_version'];
    final previousUpdated = existing?['server_updated_at'];
    await _database.insert('entity_sync_state', {
      'entity_type': entityType,
      'entity_id': entityId,
      'sync_status': syncStatus,
      'server_version':
          serverVersion ?? (previousVersion is int ? previousVersion : null),
      'local_updated_at': _now,
      'server_updated_at':
          serverUpdatedAt?.millisecondsSinceEpoch ??
          (previousUpdated is int ? previousUpdated : null),
      'last_error': lastError,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> getEntitySyncState(
    String entityType,
    String entityId,
  ) async {
    final rows = await _database.query(
      'entity_sync_state',
      where: 'entity_type = ? AND entity_id = ?',
      whereArgs: [entityType, entityId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Map<String, dynamic>.from(rows.first);
  }

  Future<void> cacheSavedSearches(List<Map<String, dynamic>> items) async {
    final batch = _database.batch();
    batch.delete('saved_searches');
    for (final item in items) {
      batch.insert('saved_searches', {
        'id': item['id'] ?? 'search-$_now',
        'json': jsonEncode(item),
        'updated_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<void> upsertSavedSearch(Map<String, dynamic> item) async {
    final id = item['id'] as String? ?? 'local-$_now';
    await _database.insert('saved_searches', {
      'id': id,
      'json': jsonEncode({...item, 'id': id}),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, dynamic>>> savedSearchRows() async {
    final rows = await _database.query(
      'saved_searches',
      orderBy: 'updated_at DESC',
    );
    return rows.map(_decodeMap).toList();
  }

  // ---------------------------------------------------------------------------
  // Namespaced read cache
  // ---------------------------------------------------------------------------

  /// Stores a response under a stable key such as
  /// `opportunities|country=KE&q=engineer|page=2`.
  ///
  /// A single blob per entity used to make one search overwrite another, so
  /// the "stale cached results" banner could show results for the wrong
  /// query. Namespacing keeps each consumer's snapshot separate.
  Future<void> cacheQuery(
    String cacheKey,
    Map<String, dynamic> value, {
    String entityType = 'generic',
  }) async {
    await _database.insert('query_cache', {
      'cache_key': cacheKey,
      'entity_type': entityType,
      'json': jsonEncode(value),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> cachedQuery(String cacheKey) async {
    final rows = await _database.query(
      'query_cache',
      where: 'cache_key = ?',
      whereArgs: [cacheKey],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  Future<DateTime?> cachedQueryAge(String cacheKey) async {
    final rows = await _database.query(
      'query_cache',
      columns: ['updated_at'],
      where: 'cache_key = ?',
      whereArgs: [cacheKey],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final value = rows.first['updated_at'];
    if (value is! int) return null;
    return DateTime.fromMillisecondsSinceEpoch(value);
  }

  Future<void> cacheMatches(List<Map<String, dynamic>> matches) async {
    final batch = _database.batch();
    batch.delete('cached_matches');
    for (final match in matches) {
      final id =
          match['id']?.toString() ??
          match['opportunityId']?.toString() ??
          'match-$_now';
      batch.insert('cached_matches', {
        'id': id,
        'json': jsonEncode(match),
        'updated_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> cachedMatches() async {
    final rows = await _database.query(
      'cached_matches',
      orderBy: 'updated_at DESC',
    );
    return rows.map(_decodeMap).toList();
  }

  Future<void> cacheCompanyDetail(
    String slug,
    Map<String, dynamic> company,
  ) async {
    await _database.insert('cached_company_details', {
      'slug': slug,
      'json': jsonEncode(company),
      'updated_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> cachedCompanyDetail(String slug) async {
    final rows = await _database.query(
      'cached_company_details',
      where: 'slug = ?',
      whereArgs: [slug],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _decodeMap(rows.first);
  }

  // ---------------------------------------------------------------------------
  // Outbox / conflicts
  // ---------------------------------------------------------------------------

  Future<List<OfflineAction>> conflictActions() async {
    final rows = await _database.query(
      'offline_actions',
      where: "status = 'conflict'",
      orderBy: 'updated_at DESC',
    );
    return rows.map(OfflineAction.fromRow).toList();
  }

  /// Applies a user's conflict decision and makes the action eligible for
  /// the next sync run.
  ///
  /// * `use_server` drops the local edit — the cached server payload wins.
  /// * `keep_local` replays the local payload with the server version so the
  ///   API can decide whether the override is still safe.
  /// * `merge` replays a payload the user/UI assembled from both sides.
  Future<void> resolveConflict(
    String idempotencyKey,
    String resolution, {
    Map<String, dynamic>? mergedPayload,
  }) async {
    if (resolution == 'use_server') {
      await deleteAction(idempotencyKey);
      return;
    }
    final rows = await _database.query(
      'offline_actions',
      where: 'idempotency_key = ?',
      whereArgs: [idempotencyKey],
      limit: 1,
    );
    if (rows.isEmpty) return;
    final action = OfflineAction.fromRow(rows.first);
    final payload = <String, dynamic>{
      ...action.payload,
      if (mergedPayload != null) ...mergedPayload,
      if (resolution == 'keep_local' && action.serverVersion != null)
        'version': action.serverVersion,
      'conflictResolution': resolution,
    };
    await _database.update(
      'offline_actions',
      {
        'payload': jsonEncode(payload),
        'status': 'pending',
        'conflict_resolution': resolution,
        'last_error': null,
        'next_retry_at': null,
        'updated_at': _now,
      },
      where: 'idempotency_key = ?',
      whereArgs: [idempotencyKey],
    );
  }

  Future<void> deleteAction(String idempotencyKey) async {
    await _database.delete(
      'offline_actions',
      where: 'idempotency_key = ?',
      whereArgs: [idempotencyKey],
    );
  }

  Future<void> updateAction(
    String idempotencyKey, {
    required String status,
    String? error,
    int? retryCount,
    DateTime? nextRetryAt,
    bool clearNextRetryAt = true,
    int? serverVersion,
    DateTime? serverUpdatedAt,
    Map<String, dynamic>? serverPayload,
    OfflineAction? action,
  }) async {
    final values = <String, Object?>{
      'status': status,
      'updated_at': _now,
      'last_error': error,
      if (retryCount != null) 'retry_count': retryCount,
      if (clearNextRetryAt)
        'next_retry_at': nextRetryAt?.millisecondsSinceEpoch,
      if (serverVersion != null) 'server_version': serverVersion,
      if (serverUpdatedAt != null)
        'server_updated_at': serverUpdatedAt.millisecondsSinceEpoch,
      if (serverPayload != null) 'server_payload': jsonEncode(serverPayload),
    };
    await _database.update(
      'offline_actions',
      values,
      where: 'idempotency_key = ?',
      whereArgs: [idempotencyKey],
    );
    if (status == 'synced' &&
        action != null &&
        action.entityType != null &&
        action.entityId != null) {
      await setEntitySyncState(
        action.entityType!,
        action.entityId!,
        'synced',
        serverVersion: serverVersion,
        serverUpdatedAt: serverUpdatedAt,
      );
    }
  }

  /// Wipes every user-scoped cache and queue. Called on revocation and
  /// account deletion; theme/base-URL preferences live in SharedPreferences
  /// and are deliberately left alone.
  Future<void> clearUserData() async {
    final batch = _database.batch();
    for (final table in [
      'recent_opportunities',
      'saved_opportunities',
      'candidate_profile',
      'preferences',
      'companies',
      'applications',
      'application_status',
      'documents',
      'notifications',
      'followups',
      'offline_actions',
      'sync_metadata',
      'entity_sync_state',
      'saved_searches',
      'job_alerts',
      'query_cache',
      'cached_matches',
      'cached_company_details',
    ]) {
      batch.delete(table);
    }
    await batch.commit(noResult: true);
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
