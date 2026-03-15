package org.app.cia.diff;

import org.app.cia.diff.Enums.ChangeType;
import org.app.cia.parser.CodeUnit;

import java.util.*;

public class ASTDiffEngine {
    public List<Change> diff(List<CodeUnit> old,List<CodeUnit> current){
        List<Change> changes=new ArrayList<>();
        HashMap<String,CodeUnit> unitMap=new HashMap<>();
        Set<String> newFiles=new HashSet<>();
        for(CodeUnit cu:old){
            unitMap.put(cu.getFilename(),cu);
        }

        for(CodeUnit cu:current){
            if(!unitMap.containsKey(cu.getFilename())){
                changes.add(new Change(cu,"",cu.getFilename(), ChangeType.ADDITION));
            }else{
                CodeUnit oldCu = unitMap.get(cu.getFilename());
                if(isModified(oldCu,cu)){
                    changes.add(new Change(cu, oldCu.getFilename(), cu.getFilename(), ChangeType.MODIFICATION));
                }
            }

            newFiles.add(cu.getFilename());
        }

        for(String key: unitMap.keySet()){
            if(!newFiles.contains(key)){
                changes.add(new Change(unitMap.get(key),key,"", ChangeType.REMOVAL));
            }
        }
        return changes;
    }
    public boolean isModified(CodeUnit old,CodeUnit curr){
        if(!(new HashSet<>(old.getMethods()).equals(new HashSet<>(curr.getMethods())))){
            return true;
        }
        if(!(new HashSet<>(old.getClasses()).equals(new HashSet<>(curr.getClasses())))){
            return true;
        }
        if(!(new HashSet<>(old.getImports()).equals(new HashSet<>(curr.getImports())))){
            return true;
        }
        if(!(new HashSet<>(old.getInterfaces()).equals(new HashSet<>(curr.getInterfaces())))){
            return true;
        }
        return false;
    }
}

