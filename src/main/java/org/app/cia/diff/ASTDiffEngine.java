package org.app.cia.diff;

import org.app.cia.diff.Enums.ChangeType;
import org.app.cia.parser.CodeUnit;

import java.util.*;

public class ASTDiffEngine {
    public List<Change> diff(List<CodeUnit> old, List<CodeUnit> current) {
        List<Change> changes = new ArrayList<>();
        HashMap<String, CodeUnit> unitMap = new HashMap<>();
        Set<String> newFiles = new HashSet<>();
        for (CodeUnit cu : old) {
            unitMap.put(cu.getFilename(), cu);
        }

        for (CodeUnit cu : current) {
            if (!unitMap.containsKey(cu.getFilename())) {
                changes.add(new Change(cu, "", cu.getFilename(), ChangeType.ADDITION));
            } else {
                CodeUnit oldCu = unitMap.get(cu.getFilename());
                changes.addAll(getFileChanges(oldCu, cu));
            }

            newFiles.add(cu.getFilename());
        }

        for (String key : unitMap.keySet()) {
            if (!newFiles.contains(key)) {
                changes.add(new Change(unitMap.get(key), key, "", ChangeType.REMOVAL));
            }
        }
        return changes;
    }

    private List<Change> compareList(List<String> oldList, List<String> newList, CodeUnit oldCu, CodeUnit newCu){

        List<Change> result=new ArrayList<>();
        Set<String> oldSet=new HashSet<>(oldList);
        Set<String> newSet=new HashSet<>(newList);

        Set<String> added = new HashSet<>(newSet);
        oldSet.forEach(added::remove);

        Set<String> removed = new HashSet<>(oldSet);
        newSet.forEach(removed::remove);

        for(String a:added){
            result.add(new Change(newCu,"",a,ChangeType.ADDITION));
        }
        for(String r:removed){
            result.add(new Change(oldCu,r,"",ChangeType.REMOVAL));
        }
        return result;

    }
    public List<Change> getFileChanges(CodeUnit old,CodeUnit curr){
        List<Change> changes=new ArrayList<>();

        changes.addAll(compareList(old.getMethods(),curr.getMethods(),old,curr));
        changes.addAll(compareList(old.getImports(),curr.getImports(),old,curr));
        changes.addAll(compareList(old.getClasses(),curr.getClasses(),old,curr));
        changes.addAll(compareList(old.getMethodCalls(),curr.getMethodCalls(),old,curr));


        return changes;
    }
}
