"""
BigQuery safety guards — enforce read-only query execution across all BQ services.

Any SQL that contains DDL or DML statements is rejected before it reaches BigQuery,
providing an application-level safeguard in addition to IAM/credential restrictions.
"""
import re

# Keywords that must never appear as the first meaningful SQL verb,
# or anywhere in a statement for multi-statement guards.
_DANGEROUS_PATTERN = re.compile(
    r"""
    \b(
        DROP      |   # DROP TABLE / DATASET / VIEW / ...
        DELETE    |   # DELETE FROM ...
        TRUNCATE  |   # TRUNCATE TABLE ...
        INSERT    |   # INSERT INTO ...
        UPDATE    |   # UPDATE SET ...
        MERGE     |   # MERGE (upsert)
        ALTER     |   # ALTER TABLE ...
        CREATE    |   # CREATE TABLE / VIEW / ...
        CALL      |   # CALL stored procedure
        EXPORT    |   # EXPORT DATA
        LOAD      |   # LOAD DATA
        COPY      |   # COPY ... TO ...
        GRANT     |   # GRANT privileges
        REVOKE        # REVOKE privileges
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def assert_read_only(sql: str) -> None:
    """
    Raise ValueError if *sql* contains any DDL or DML keyword.

    This is a defence-in-depth check.  The primary protection is the
    IAM role assigned to the service account (bigquery.dataViewer +
    bigquery.jobUser), but this guard prevents accidental or injected
    mutation statements from reaching BigQuery at all.

    Args:
        sql: The SQL string to validate.

    Raises:
        ValueError: if a dangerous keyword is detected.
    """
    match = _DANGEROUS_PATTERN.search(sql)
    if match:
        raise ValueError(
            f"Unsafe BigQuery operation blocked: keyword '{match.group(1).upper()}' "
            f"is not allowed. Only read-only (SELECT) queries are permitted."
        )
