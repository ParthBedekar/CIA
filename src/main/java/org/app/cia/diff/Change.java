package org.app.cia.diff;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.app.cia.diff.Enums.ChangeType;
import org.app.cia.parser.CodeUnit;

@Getter
@AllArgsConstructor
public class Change {
    @JsonIgnore
    private CodeUnit affectedCu;
    private String oldParameter;
    private String newParameter;
    private ChangeType changeType;
}
