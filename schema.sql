-- Not the source of truth, so feel free to drop and recreate the table

-- ~~It May be source of truth, so backup before dropping!~~
DROP TABLE IF EXISTS GlobalMessages;
CREATE TABLE IF NOT EXISTS GlobalMessages (
    UniqueID INTEGER PRIMARY KEY NOT NULL,
    Folder TEXT NOT NULL,
    MessageID TEXT NOT NULL UNIQUE,
    MessageIDHash TEXT NOT NULL UNIQUE,
    Epoch INTEGER NOT NULL, -- Timestamp
    InReplyTo TEXT,
    SubjectLine TEXT,
    Author TEXT NOT NULL, -- JSON, PostalMime structure
    Recipients TEXT, -- JSON list containing both To and CC
    -- ContentType TEXT NOT NULL,
    RAWMessage INTEGER NOT NULL, -- 1 if exists, 0 if not
    FolderSerial INTEGER
)STRICT;

