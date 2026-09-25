ALTER TABLE records
    ADD INDEX idx_records_user_recorded_at (user_id, recorded_at),
    ADD INDEX idx_records_recorded_at (recorded_at);
