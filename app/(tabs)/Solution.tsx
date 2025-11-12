import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from "react-native";
import { useRoute, useNavigation, NavigationProp, RouteProp } from "@react-navigation/native";

// Helper function to convert decimal to fraction
const decimalToFraction = (decimal: number): string => {
  if (decimal === Infinity) return "∞";
  if (decimal === -Infinity) return "-∞";
  if (!Number.isFinite(decimal)) return "NaN";
  if (decimal === 0) return "0";
  if (Math.abs(decimal) < 1e-10) return "0";
  
  const isNegative = decimal < 0;
  const absDecimal = Math.abs(decimal);
  
  if (Math.abs(absDecimal - Math.round(absDecimal)) < 1e-10) {
    return isNegative ? `-${Math.round(absDecimal)}` : `${Math.round(absDecimal)}`;
  }
  
  const tolerance = 1.0E-10;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = absDecimal;
  let iterations = 0;
  const maxIterations = 50;
  
  while (iterations < maxIterations) {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    
    if (k1 !== 0 && Math.abs(absDecimal - h1 / k1) <= absDecimal * tolerance) {
      break;
    }
    
    if (Math.abs(b - a) < tolerance) break;
    b = 1 / (b - a);
    if (!Number.isFinite(b)) break;
    iterations++;
  }
  
  if (k1 === 0 || !Number.isFinite(h1) || !Number.isFinite(k1)) {
    return parseFloat(decimal.toFixed(6)).toString();
  }
  
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  };
  
  const divisor = gcd(Math.abs(h1), Math.abs(k1));
  const numerator = Math.abs(h1) / divisor;
  const denominator = Math.abs(k1) / divisor;
  
  if (denominator === 1) {
    return isNegative ? `-${numerator}` : `${numerator}`;
  }
  
  if (denominator > 10000 || numerator > 10000) {
    return parseFloat(decimal.toFixed(6)).toString();
  }
  
  return isNegative ? `-${numerator}/${denominator}` : `${numerator}/${denominator}`;
};

type RootStackParamList = {
  Home: undefined;
  NextComponent: { optimization: string; variables: string; constraints: string };
  Solution: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
    constraintTypes: string[];
    variableSigns: string[];
  };
  SensitivityAnalysis: {
    finalTable: number[][];
    variables: string[];
    basicVariables: string[];
    cj: number[];
    optType: string;
    originalObjective: number[];
    variableSigns: string[];
    constraintsMatrix: number[][];
    originalRHS: number[];
  };
};

type SolutionPageRouteProp = RouteProp<RootStackParamList, "Solution">;

// Enhanced variable mapping structure
interface VariableTransform {
  originalIndex: number;
  originalName: string;
  transformType: 'normal' | 'negated' | 'unrestricted_pos' | 'unrestricted_neg';
  transformedName: string;
}

export default function SolutionPage() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<SolutionPageRouteProp>();
  
  const { 
    objective: initialObjective, 
    constraintsMatrix: initialConstraints, 
    rhs: initialRhs, 
    optType, 
    constraintTypes,
    variableSigns 
  } = route.params;

  const [simplexTable, setSimplexTable] = useState<number[][]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [cj, setCj] = useState<number[]>([]);
  const [basicVariables, setBasicVariables] = useState<string[]>([]);
  const [equations, setEquations] = useState<string[]>([]);
  const [enteringVar, setEnteringVar] = useState<string | null>(null);
  const [leavingVar, setLeavingVar] = useState<string | null>(null);
  const [iteration, setIteration] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);

  const [variableTransforms, setVariableTransforms] = useState<VariableTransform[]>([]);
  const [originalVarCount, setOriginalVarCount] = useState<number>(0);

  const [initialState, setInitialState] = useState<{
    table: number[][];
    vars: string[];
    cj: number[];
    basics: string[];
    iteration: number;
    equations: string[];
  } | null>(null);

  useEffect(() => {
    setOriginalVarCount(initialObjective.length);
    
    const processedConstraints = initialConstraints.map(row => [...row]);
    const processedRhs = initialRhs.map(val => Math.abs(val));

    const { transformedObj, transformedConstraints, newVarSigns, transforms } = 
      transformVariables(initialObjective, processedConstraints, variableSigns);
    
    setVariableTransforms(transforms);
    formatEquations(initialObjective, initialConstraints, initialRhs, variableSigns);
    
    // For MAXIMIZATION: use objective as-is
    // For MINIMIZATION: negate objective (we maximize -Z)
    const adjustedObjective = optType === "Minimize" ? 
      transformedObj.map((v) => -v) : [...transformedObj];
    
    createInitialSimplexTable(adjustedObjective, transformedConstraints, processedRhs);
    
  }, [initialObjective, initialConstraints, initialRhs, optType, variableSigns]);

  const transformVariables = (
    obj: number[],
    constraints: number[][],
    varSigns: string[]
  ) => {
    let transformedObj: number[] = [];
    let transformedConstraints: number[][] = constraints.map(row => []);
    let newVarSigns: string[] = [];
    let transforms: VariableTransform[] = [];
    
    let newVarIndex = 1;

    for (let i = 0; i < obj.length; i++) {
      const sign = varSigns[i];
      const originalVarName = `x${i + 1}`;
      
      if (sign === "≥0") {
        const transformedName = `x${newVarIndex}`;
        transformedObj.push(obj[i]);
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(constraints[r][i]);
        }
        newVarSigns.push("≥0");
        transforms.push({
          originalIndex: i,
          originalName: originalVarName,
          transformType: 'normal',
          transformedName: transformedName
        });
        newVarIndex++;
        
      } else if (sign === "≤0") {
        const transformedName = `x${newVarIndex}`;
        transformedObj.push(-obj[i]);
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(-constraints[r][i]);
        }
        newVarSigns.push("≥0");
        transforms.push({
          originalIndex: i,
          originalName: originalVarName,
          transformType: 'negated',
          transformedName: transformedName
        });
        newVarIndex++;
        
      } else if (sign === "unrestricted") {
        const transformedName1 = `x${newVarIndex}`;
        const transformedName2 = `x${newVarIndex + 1}`;

        transformedObj.push(obj[i]);
        transformedObj.push(-obj[i]);
        
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(constraints[r][i]);
          transformedConstraints[r].push(-constraints[r][i]);
        }
        
        newVarSigns.push("≥0");
        newVarSigns.push("≥0");
        transforms.push({
          originalIndex: i,
          originalName: originalVarName,
          transformType: 'unrestricted_pos',
          transformedName: transformedName1
        });
        transforms.push({
          originalIndex: i,
          originalName: originalVarName,
          transformType: 'unrestricted_neg',
          transformedName: transformedName2
        });
        newVarIndex += 2;
      }
    }

    return { 
      transformedObj, 
      transformedConstraints, 
      newVarSigns, 
      transforms 
    };
  };

  const formatEquations = (obj: number[], constraints: number[][], rhsValues: number[], varSigns: string[]) => {
    const originalObjectiveTerms = obj
      .map((coeff, index) => {
        if (Math.abs(coeff) < 1e-10) return null;
        const sign = coeff >= 0 ? "+" : "-";
        const absCoeff = Math.abs(coeff);
        const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
        return `${sign} ${coeffStr}x${index + 1}`;
      })
      .filter((t) => t !== null);
    
    let originalObjectiveStr = (originalObjectiveTerms as string[]).join(" ");
    if (originalObjectiveStr.startsWith("+ ")) originalObjectiveStr = originalObjectiveStr.substring(2);
    if (originalObjectiveStr === "") originalObjectiveStr = "0";
    const formattedObjective = `${optType === "Maximize" ? "Maximize" : "Minimize"} Z = ${originalObjectiveStr}`;

    const constraintEquations = constraints.map((constraint, rowIndex) => {
      const constraintTerms = constraint
        .map((coeff, index) => {
          if (Math.abs(coeff) < 1e-10) return null;
          const sign = coeff >= 0 ? "+" : "-";
          const absCoeff = Math.abs(coeff);
          const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
          return `${sign} ${coeffStr}x${index + 1}`;
        })
        .filter((t) => t !== null) as string[];

      let constraintStr = constraintTerms.join(" ");
      if (constraintStr.startsWith("+ ")) constraintStr = constraintStr.substring(2);
      if (constraintStr === "") constraintStr = "0";
      return `${constraintStr} ${constraintTypes[rowIndex]} ${decimalToFraction(rhsValues[rowIndex])}`;
    });

    const nonNegativityConstraints = varSigns.map((sign, index) => {
      if (sign === "≥0") return `x${index + 1} ≥ 0`;
      if (sign === "≤0") return `x${index + 1} ≤ 0`;
      return `x${index + 1} unrestricted`;
    });
    
    setEquations([formattedObjective, ...constraintEquations, ...nonNegativityConstraints]);
  };

  const createInitialSimplexTable = (obj: number[], constraints: number[][], rhsValues: number[]) => {
    const numVars = obj.length;
    const numConstraints = constraints.length;

    const newCj = [...obj, ...Array(numConstraints).fill(0)];
    setCj(newCj);

    const newVariables = [
      ...Array(numVars).fill(0).map((_, i) => `x${i + 1}`),
      ...Array(numConstraints).fill(0).map((_, i) => `s${i + 1}`),
    ];
    setVariables(newVariables);

    const newBasicVariables = Array(numConstraints).fill(0).map((_, i) => `s${i + 1}`);
    setBasicVariables(newBasicVariables);

    const newSimplexTable: number[][] = [];
    for (let i = 0; i < numConstraints; i++) {
      const row = [
        ...constraints[i],
        ...Array(numConstraints).fill(0).map((_, j) => (i === j ? 1 : 0)),
        rhsValues[i],
      ];
      newSimplexTable.push(row);
    }

    const cols = numVars + numConstraints + 1;
    const zjRow = Array(cols).fill(0);
    const zjMinusCjRow = Array(cols).fill(0);
    newSimplexTable.push(zjRow);
    newSimplexTable.push(zjMinusCjRow);

    setSimplexTable(newSimplexTable);
    setIteration(1);
    setMessage(null);

    const computed = computeZjAndZjMinusCj(newSimplexTable, newBasicVariables, newCj, newVariables);
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);

    setInitialState({
      table: computed.table.map((r) => [...r]),
      vars: newVariables.slice(),
      cj: newCj.slice(),
      basics: newBasicVariables.slice(),
      iteration: 1,
      equations: equations.slice(),
    });
  };

  const computeZjAndZjMinusCj = (
    table: number[][],
    basicVars: string[],
    cjRow: number[],
    allVars: string[]
  ) => {
    if (table.length === 0) return { table, enteringVar: null as string | null, leavingVar: null as string | null };

    const hasZjRows = table.length > basicVars.length;
    const rowsCount = hasZjRows ? table.length - 2 : table.length;
    const cols = table[0].length;
    
    const cb: number[] = basicVars.map((b) => {
      const idx = allVars.indexOf(b);
      if (idx === -1) return 0;
      return cjRow[idx] ?? 0;
    });

    const zjRow = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let i = 0; i < rowsCount; i++) {
        sum += cb[i] * table[i][j];
      }
      zjRow[j] = sum;
    }

    const zjMinusCjRow = Array(cols).fill(0);
    for (let j = 0; j < cols - 1; j++) {
      if (j < cjRow.length) {
        zjMinusCjRow[j] = zjRow[j] - cjRow[j];
      } else {
        zjMinusCjRow[j] = zjRow[j];
      }
    }
    zjMinusCjRow[cols - 1] = 0;

    for (let j = 0; j < cols; j++) {
      if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
      if (Math.abs(zjMinusCjRow[j]) < 1e-10) zjMinusCjRow[j] = 0;
    }

    const newTable: number[][] = [];
    for (let i = 0; i < rowsCount; i++) {
      newTable.push([...table[i]]);
    }
    newTable.push(zjRow);
    newTable.push(zjMinusCjRow);

    const zjMinusCjVars = zjMinusCjRow.slice(0, allVars.length);
    const minVal = Math.min(...zjMinusCjVars);
    
    if (minVal >= -1e-10) {
      return { table: newTable, enteringVar: null as string | null, leavingVar: null as string | null };
    }
    
    const enteringIndex = zjMinusCjVars.indexOf(minVal);
    const enteringVarName = allVars[enteringIndex];

    let minRatio = Infinity;
    let leavingIdx = -1;
    for (let i = 0; i < rowsCount; i++) {
      const colVal = newTable[i][enteringIndex];
      const rhsVal = newTable[i][newTable[i].length - 1];
      if (colVal > 1e-10) {
        const ratio = rhsVal / colVal;
        if (ratio >= -1e-10 && ratio < minRatio - 1e-10) {
          minRatio = ratio;
          leavingIdx = i;
        }
      }
    }

    const leavingVarName = leavingIdx === -1 ? null : basicVars[leavingIdx];
    return { table: newTable, enteringVar: enteringVarName, leavingVar: leavingVarName };
  };

  const performPivot = (currentTable: number[][], pivotRowIdx: number, pivotColIdx: number) => {
    const hasZjRows = currentTable.length > basicVariables.length;
    const rowsCount = hasZjRows ? currentTable.length - 2 : currentTable.length;
    
    const table: number[][] = [];
    for (let i = 0; i < rowsCount; i++) {
      table.push([...currentTable[i]]);
    }
    
    const cols = table[0].length;
    const pivotVal = table[pivotRowIdx][pivotColIdx];

    if (Math.abs(pivotVal) < 1e-12) {
      throw new Error("Pivot value is too close to zero.");
    }

    for (let j = 0; j < cols; j++) {
      table[pivotRowIdx][j] = table[pivotRowIdx][j] / pivotVal;
      if (Math.abs(table[pivotRowIdx][j]) < 1e-12) {
        table[pivotRowIdx][j] = 0;
      }
    }

    for (let i = 0; i < rowsCount; i++) {
      if (i === pivotRowIdx) continue;
      const factor = table[i][pivotColIdx];
      if (Math.abs(factor) < 1e-12) continue;
      
      for (let j = 0; j < cols; j++) {
        table[i][j] = table[i][j] - factor * table[pivotRowIdx][j];
        if (Math.abs(table[i][j]) < 1e-12) {
          table[i][j] = 0;
        }
      }
    }

    return table;
  };

  const handleNextIteration = () => {
    setMessage(null);
    if (!simplexTable || simplexTable.length < 2) return;

    const zjMinusCjRow = simplexTable[simplexTable.length - 1];
    const zjMinusCjVars = zjMinusCjRow.slice(0, variables.length);
    const minVal = Math.min(...zjMinusCjVars);

    if (minVal >= -1e-10) {
      setEnteringVar(null);
      setLeavingVar(null);
      setMessage(getOptimalSolutionMessage());
      return;
    }

    const enteringIndex = zjMinusCjVars.indexOf(minVal);
    const enteringVarName = variables[enteringIndex];

    const rowsCount = simplexTable.length - 2;
    const cols = simplexTable[0].length;
    let minRatio = Infinity;
    let leavingRowIdx = -1;
    for (let i = 0; i < rowsCount; i++) {
      const colVal = simplexTable[i][enteringIndex];
      const rhsVal = simplexTable[i][cols - 1];
      if (colVal > 1e-10) {
        const ratio = rhsVal / colVal;
        if (ratio >= -1e-10 && ratio < minRatio - 1e-10) {
          minRatio = ratio;
          leavingRowIdx = i;
        }
      }
    }

    if (leavingRowIdx === -1) {
      setEnteringVar(enteringVarName);
      setLeavingVar(null);
      setMessage("Problem is unbounded (no valid leaving variable).");
      return;
    }
    
    const leavingVarName = basicVariables[leavingRowIdx];

    try {
      const pivotedTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
      const newBasics = basicVariables.slice();
      newBasics[leavingRowIdx] = enteringVarName;
      
      const computed = computeZjAndZjMinusCj(pivotedTable, newBasics, cj, variables);

      setSimplexTable(computed.table);
      setBasicVariables(newBasics);
      setEnteringVar(computed.enteringVar);
      setLeavingVar(computed.leavingVar);
      setIteration((prev) => prev + 1);

      const zjMinusCjNow = computed.table[computed.table.length - 1].slice(0, variables.length);
      const minNow = Math.min(...zjMinusCjNow);
      if (minNow >= -1e-10) {
        setMessage(getOptimalSolutionMessage());
        setEnteringVar(null);
        setLeavingVar(null);
      }
    } catch (err) {
      setMessage("Error during pivot: " + (err as Error).message);
    }
  };

  const getOptimalSolutionMessage = (): string => {
    if (!simplexTable || simplexTable.length < 2) return "Error: Invalid table state";
    
    const cols = simplexTable[0].length;
    const zjRow = simplexTable[simplexTable.length - 2];
    const optimalZ = zjRow[cols - 1];
    
    const actualZ = optType === "Minimize" ? -optimalZ : optimalZ;
    
    let message = `Optimal Solution Found:\nZ = ${decimalToFraction(actualZ)}\n`;
    
    for (let i = 0; i < originalVarCount; i++) {
      const originalVar = `x${i + 1}`;
      const value = getOriginalVariableValue(i);
      message += `${originalVar} = ${decimalToFraction(value)}\n`;
    }
    
    return message;
  };

  const getOriginalVariableValue = (originalIndex: number): number => {
    if (!simplexTable || simplexTable.length < 2) return 0;
    
    let value = 0;
    
    const relatedTransforms = variableTransforms.filter(t => t.originalIndex === originalIndex);
    
    for (const transform of relatedTransforms) {
      const basicIdx = basicVariables.indexOf(transform.transformedName);
      
      if (basicIdx !== -1 && basicIdx < simplexTable.length - 2) {
        const cols = simplexTable[0].length;
        const rhsValue = simplexTable[basicIdx][cols - 1];
        
        switch (transform.transformType) {
          case 'normal':
            value = rhsValue;
            break;
          case 'negated':
            value = -rhsValue;
            break;
          case 'unrestricted_pos':
            value += rhsValue;
            break;
          case 'unrestricted_neg':
            value -= rhsValue;
            break;
        }
      }
    }
    
    return value;
  };

  const handleReset = () => {
    if (!initialState) return;
    setSimplexTable(initialState.table.map((r) => [...r]));
    setVariables(initialState.vars.slice());
    setCj(initialState.cj.slice());
    setBasicVariables(initialState.basics.slice());
    setIteration(1);
    setEquations(initialState.equations.slice());
    setMessage(null);

    const computed = computeZjAndZjMinusCj(initialState.table, initialState.basics, initialState.cj, initialState.vars);
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);
  };

  const handleSolveToOptimal = () => {
    setMessage(null);
    let currentTable = simplexTable.map(r => [...r]);
    let currentBasics = basicVariables.slice();
    let currentIteration = iteration;
    
    const maxIterations = 100;
    
    for (let i = 0; i < maxIterations; i++) {
      const lastRow = currentTable[currentTable.length - 1] ?? [];
      const zjMinusCjVars = lastRow.slice(0, variables.length);
      const minVal = zjMinusCjVars.length ? Math.min(...zjMinusCjVars) : Infinity;
      
      if (minVal >= -1e-10) {
        setSimplexTable(currentTable);
        setBasicVariables(currentBasics);
        setIteration(currentIteration);
        setMessage(getOptimalSolutionMessage());
        setEnteringVar(null);
        setLeavingVar(null);
        return;
      }
      
      const enteringIndex = zjMinusCjVars.indexOf(minVal);
      
      let minRatio = Infinity;
      let leavingRowIdx = -1;
      const rowsCount = currentTable.length - 2;
      const cols = currentTable[0].length;
      
      for (let r = 0; r < rowsCount; r++) {
        const colVal = currentTable[r][enteringIndex];
        const rhsVal = currentTable[r][cols - 1];
        if (colVal > 1e-10) {
          const ratio = rhsVal / colVal;
          if (ratio >= -1e-10 && ratio < minRatio - 1e-10) {
            minRatio = ratio;
            leavingRowIdx = r;
          }
        }
      }
      
      if (leavingRowIdx === -1) {
        setSimplexTable(currentTable);
        setBasicVariables(currentBasics);
        setIteration(currentIteration);
        setMessage("Problem is unbounded (no valid leaving variable).");
        setEnteringVar(variables[enteringIndex]);
        setLeavingVar(null);
        return;
      }

      try {
        const pivotedTable = performPivot(currentTable, leavingRowIdx, enteringIndex);
        const newBasics = currentBasics.slice();
        newBasics[leavingRowIdx] = variables[enteringIndex];
        const computed = computeZjAndZjMinusCj(pivotedTable, newBasics, cj, variables);

        currentTable = computed.table;
        currentBasics = newBasics;
        currentIteration++;
        
      } catch (err) {
        setMessage("Error during automatic pivot: " + (err as Error).message);
        return;
      }
    }
    
    setSimplexTable(currentTable);
    setBasicVariables(currentBasics);
    setIteration(currentIteration);
    setMessage("Stopped: reached maximum automatic iterations limit.");
  };

  const handleSensitivityAnalysis = () => {
    if (!simplexTable || simplexTable.length < 2) {
      Alert.alert("Error", "No valid solution table available for sensitivity analysis.");
      return;
    }

    if (!message?.includes("Optimal")) {
      Alert.alert(
        "Warning",
        "Sensitivity analysis is typically performed on an optimal solution. Please solve to optimal first.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue Anyway", onPress: () => navigateToSensitivity() }
        ]
      );
      return;
    }

    navigateToSensitivity();
  };

  const navigateToSensitivity = () => {
    // Calculate B-inverse from slack variable columns
    const m = simplexTable.length - 2;
    const bInv: number[][] = [];
    
    for (let i = 0; i < m; i++) {
      const row: number[] = [];
      for (let j = 0; j < m; j++) {
        const slackVar = `s${j + 1}`;
        const idx = variables.indexOf(slackVar);
        
        if (idx !== -1) {
          row.push(simplexTable[i][idx]);
        } else {
          row.push(i === j ? 1 : 0);
        }
      }
      bInv.push(row);
    }

    // For minimization problems, we need to adjust the objective coefficients back
    const adjustedCj = optType === "Minimize" ? cj.map(c => -c) : cj.slice();

    navigation.navigate("SensitivityAnalysis", {
      finalTable: simplexTable.map(row => [...row]),
      variables: variables.slice(),
      basicVariables: basicVariables.slice(),
      cj: adjustedCj,
      optType: optType,
      originalObjective: initialObjective.slice(),
      variableSigns: variableSigns.slice(),
      constraintsMatrix: initialConstraints.map(row => [...row]),
      originalRHS: initialRhs.slice(),
    });
  };

  const renderSimplexTable = () => {
    if (simplexTable.length === 0) return null;

    const numVars = variables.length;
    const screenWidth = Dimensions.get("window").width;
    const cellWidth = Math.max(80, screenWidth / (numVars + 3)); 

    return (
      <View style={styles.tableContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View>
            {/* Cj Row */}
            <View style={[styles.row, styles.cjRow]}>
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>Cj →</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}></Text>
              </View>
              {cj.map((value, index) => (
                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                  <Text style={styles.headerText}>{decimalToFraction(value)}</Text>
                </View>
              ))}
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}></Text>
              </View>
            </View>

            {/* Header Row */}
            <View style={[styles.row, styles.headerRow]}>
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>Basis</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>CB</Text>
              </View>
              {variables.map((variable, index) => (
                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth, ...(variable === enteringVar ? styles.pivotCol : {}) }]}>
                  <Text style={styles.headerText}>{variable}</Text>
                  {variable === enteringVar && <Text style={styles.pivotIndicator}>↓</Text>}
                </View>
              ))}
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>Solution</Text>
              </View>
            </View>

            {/* Data Rows */}
            {simplexTable.slice(0, -2).map((row, rowIndex) => {
              const isLeavingRow = basicVariables[rowIndex] === leavingVar;
              return (
              <View key={rowIndex} style={[styles.row, isLeavingRow ? styles.pivotRow : {}]}>
                <View style={[styles.cell, { width: cellWidth }]}>
                  <Text style={styles.cellText}>{basicVariables[rowIndex]}</Text>
                  {isLeavingRow && <Text style={styles.pivotIndicator}>→</Text>}
                </View>
                <View style={[styles.cell, { width: cellWidth }]}>
                  {
                    (() => {
                      const idx = variables.indexOf(basicVariables[rowIndex]);
                      return <Text style={styles.cellText}>{idx === -1 ? "0" : decimalToFraction(cj[idx])}</Text>;
                    })()
                  }
                </View>
                {row.map((value, colIndex) => {
                  const isPivotElement = isLeavingRow && variables[colIndex] === enteringVar;
                  return (
                    <View key={colIndex} style={[styles.cell, { width: cellWidth }, isPivotElement ? styles.pivotElement : {}]}>
                      <Text style={styles.cellText}>
                        {decimalToFraction(value)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )})}

            {/* Zj Row */}
            <View style={[styles.row, styles.zjRow]}>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}>Zj</Text>
              </View>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}></Text>
              </View>
              {simplexTable[simplexTable.length - 2].map((value, colIndex) => (
                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                  <Text style={styles.cellText}>
                    {decimalToFraction(value)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Zj - Cj Row */}
            <View style={[styles.row, styles.cjZjRow]}>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}>Zj - Cj</Text>
              </View>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}></Text>
              </View>
              {simplexTable[simplexTable.length - 1].map((value, colIndex) => (
                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                  <Text style={[styles.cellText, value < -1e-10 ? styles.negativeValue : (value > 1e-10 ? styles.positiveValue : {})]}>
                    {decimalToFraction(value)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const handleGoBack = () => {
    navigation.goBack();
  };
  
  const isOptimal = message?.startsWith("Optimal") || false;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Linear Programming Problem</Text>

        <View style={styles.equationsContainer}>
          <Text style={styles.subHeading}>Problem Formulation:</Text>
          {equations.map((equation, index) => (
            <Text key={index} style={styles.equationText}>
              {equation}
            </Text>
          ))}
        </View>

        <Text style={styles.subHeading}>Simplex Table (Iteration {iteration})</Text>

        {renderSimplexTable()}

        {/* Pivot information */}
        <View style={styles.equationsContainer}>
          <Text style={styles.subHeading}>Pivot Information:</Text>
          <Text style={styles.equationText}>Entering Variable: {enteringVar ?? "None"}</Text>
          <Text style={styles.equationText}>Leaving Variable: {leavingVar ?? "None"}</Text>
          {message ? <Text style={[styles.equationText, { fontStyle: "normal", color: isOptimal ? "#4CAF50" : "#FFD54F" }]}>Optimality Reached</Text> : null}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, (isOptimal || message?.startsWith("Problem is unbounded")) && { backgroundColor: "#9E9E9E" }]}
            onPress={handleNextIteration}
            disabled={isOptimal || message?.startsWith("Problem is unbounded")}
          >
            <Text style={styles.nextButtonText}>Next Iteration</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10 }}>
          <TouchableOpacity
            style={[
              styles.sensitivityButton,
              !message?.includes("Optimal") && { opacity: 0.6 }
            ]}
            onPress={handleSensitivityAnalysis}
          >
            <Text style={styles.sensitivityButtonText}>📊 Sensitivity Analysis</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <TouchableOpacity 
            style={[styles.solveButton, (isOptimal || message?.startsWith("Problem is unbounded")) && { backgroundColor: "#9E9E9E" }]} 
            onPress={handleSolveToOptimal}
            disabled={isOptimal || message?.startsWith("Problem is unbounded")}
          >
            <Text style={styles.solveButtonText}>Solve to Optimal</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#3b5998" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  heading: { color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
  subHeading: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 10, marginTop: 15, textAlign: "center" },
  equationsContainer: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 15, borderRadius: 8, marginBottom: 20 },
  equationText: { color: "#fff", fontSize: 16, marginBottom: 8, fontFamily: 'monospace' },
  tableContainer: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, marginBottom: 20, minHeight: 200 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255, 255, 255, 0.5)" },
  cjRow: { backgroundColor: "rgba(255, 165, 0, 0.3)" },
  headerRow: { backgroundColor: "rgba(255, 255, 255, 0.2)" },
  zjRow: { backgroundColor: "rgba(0, 255, 0, 0.1)" },
  cjZjRow: { backgroundColor: "rgba(255, 0, 0, 0.1)", borderBottomWidth: 0 },
  cell: { padding: 10, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "rgba(255, 255, 255, 0.5)" },
  headerCell: { backgroundColor: "rgba(255, 255, 255, 0.3)" },
  headerText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  cellText: { color: "#fff", fontSize: 14, fontFamily: 'monospace' },
  negativeValue: { color: "#ffb3b3", fontWeight: "bold" },
  positiveValue: { color: "#b3ffb3", fontWeight: "bold" },
  buttonContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  backButton: { backgroundColor: "#fff", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginRight: 8 },
  resetButton: { backgroundColor: "#FFD54F", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginHorizontal: 8 },
  nextButton: { backgroundColor: "#4CAF50", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginLeft: 8 },
  backButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  resetButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  nextButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  solveButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 30, alignItems: "center", flex: 1 },
  solveButtonText: { color: "#fff", fontWeight: "bold" },
  sensitivityButton: {
    backgroundColor: "#9C27B0",
    padding: 15,
    borderRadius: 30,
    alignItems: "center",
  },
  sensitivityButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  pivotRow: { backgroundColor: "rgba(255, 100, 100, 0.3)" },
  pivotCol: { backgroundColor: "rgba(100, 255, 100, 0.3)" },
  pivotElement: { backgroundColor: "rgba(255, 255, 100, 0.5)" },
  pivotIndicator: { color: "#FFD54F", fontWeight: "bold", fontSize: 18, position: "absolute", right: 5 },
});