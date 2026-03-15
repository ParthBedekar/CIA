package org.app.cia.diff;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.app.cia.diff.Enums.ChangeType;
import org.app.cia.parser.CodeUnit;

@Getter
@AllArgsConstructor
public class Change {
    private CodeUnit affectedCu;
    private String oldParameter;
    private String newParameter;
    private ChangeType changeType;
}
