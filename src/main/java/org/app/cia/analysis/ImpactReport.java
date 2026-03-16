package org.app.cia.analysis;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.Setter;
import org.app.cia.diff.Change;
import org.app.cia.parser.CodeUnit;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Getter
public class ImpactReport {

    private final List<Change> rawChanges;
    @Setter
    @JsonIgnore
    private Set<CodeUnit> affectedUnits;
    @Setter
    private Map<String, List<CodeUnit>> affectedProcessMap;

    public ImpactReport(List<Change> rawChanges){
        this.rawChanges=rawChanges;
    }




}
