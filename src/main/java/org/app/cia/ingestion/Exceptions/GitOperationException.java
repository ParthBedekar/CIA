package org.app.cia.ingestion.Exceptions;

public class GitOperationException extends RuntimeException {
    public GitOperationException(String message) {
        super(message);
    }
}
