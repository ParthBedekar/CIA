package org.app.cia.process;

import org.app.cia.parser.CodeUnit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ProcessMapper {

    public Map<String, List<CodeUnit>> mapProcesses(List<CodeUnit> codeUnits){
        Map<String,List<CodeUnit>> result=new HashMap<>();
        for(CodeUnit cu:codeUnits){
            result.computeIfAbsent(cu.getFilePath().getParent().getFileName().toString(),k->new ArrayList<>()).add(cu);
        }
        return result;
    }
}
