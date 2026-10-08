def ensure_psycopg2() -> bool:
    """Use the real psycopg2 when installed; otherwise register the psql-backed test stand-in. Returns True if the stand-in is used."""
    try:
        import psycopg2  # noqa: F401
        return False
    except ImportError:
        from .psql_driver import install
        install()
        return True
