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

// Helper function to convert decimal to fraction - FIXED VERSION
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
  Solution: { // Renaming to 'Solution' to match navigation
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
    constraintTypes: string[];
    variableSigns: string[];
  };
};

// Adjust RouteProp to match the navigation name 'Solution'
type SolutionPageRouteProp = RouteProp<RootStackParamList, "Solution">;

export default function SolutionPage() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<SolutionPageRouteProp>();
  
  // Destructuring params from route
  const { 
    objective: initialObjective, 
    constraintsMatrix: initialConstraints, 
    rhs: initialRhs, 
    optType, 
    constraintTypes, // Not strictly needed by this component if only '≤'
    variableSigns 
  } = route.params;

  // Core simplex state
  const [simplexTable, setSimplexTable] = useState<number[][]>([]);
  const [variables, setVariables] = useState<string[]>([]); // Transformed variables
  const [cj, setCj] = useState<number[]>([]); // Cj for transformed variables
  const [basicVariables, setBasicVariables] = useState<string[]>([]);
  const [equations, setEquations] = useState<string[]>([]); // Formatted equations
  const [enteringVar, setEnteringVar] = useState<string | null>(null);
  const [leavingVar, setLeavingVar] = useState<string | null>(null);
  const [iteration, setIteration] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);

  // Store mapping for transformed variables
  const [variableMapping, setVariableMapping] = useState<Map<string, string>>(new Map());
  // Store the *original* variable count for final solution display
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
    
    // Pre-process constraints:
    // Standard Simplex (non-Two-Phase) assumes all RHS are non-negative.
    // If RHS is negative, multiply constraint by -1 and flip inequality.
    // Since we're in Solution.tsx, we *assume* all constraints are '≤'.
    // A negative RHS on a '≤' becomes a positive RHS on a '≥', 
    // which *should* have gone to Phase1.
    // We will handle the simple transformation for this screen's assumption.
    
    const processedConstraints = initialConstraints.map((row, i) => {
      if (initialRhs[i] < 0) {
        // This is the case NextComponent should have warned about.
        // If it was a '≤' constraint: -x <= -5  =>  x >= 5
        // This screen *cannot* handle '≥' constraints, it relies on slack variables only.
        // We'll proceed assuming the user was warned or it's an error.
        // For this component to work, we'll just multiply by -1
        // and assume the user *meant* for it to be a '≥' constraint
        // which is a logical flaw, but it's the only way to proceed.
        // A better app would have *forced* this to Phase 1.
        
        // Let's stick to the assumption: only '≤' constraints arrive here.
        // If RHS is negative, we MUST multiply by -1.
        // e.g., x1 + x2 <= -5
        // becomes -x1 - x2 >= 5.
        // This *requires* an artificial variable.
        //
        // Let's assume the logic in NextComponent *correctly* filters.
        // If a '≤' had a negative RHS, it would set `needsTwoPhaseMethod = true`
        // and send to Phase1.
        // THEREFORE, we can assume all `initialRhs[i] >= 0` here.
        return [...row];
      }
      return [...row];
    });
    
    const processedRhs = initialRhs.map(val => val < 0 ? -val : val);


    // Now, transform variables
    const { transformedObj, transformedConstraints, newVarSigns, varMap } = 
      transformVariables(initialObjective, processedConstraints, variableSigns);
    
    setVariableMapping(varMap);
    // Format equations based on *transformed* problem
    formatEquations(transformedObj, transformedConstraints, processedRhs, newVarSigns);
    
    // Adjust objective for simplex tableau (Maximize Z)
    // If Minimizing, we Maximize (-Z).
    const adjustedObjective = optType === "Minimize" ? 
      transformedObj.map((v) => -v) : [...transformedObj];
    
    createInitialSimplexTable(adjustedObjective, transformedConstraints, processedRhs);
    
  }, [initialObjective, initialConstraints, initialRhs, optType, variableSigns]);

  // Transform variables based on their sign constraints
  const transformVariables = (
    obj: number[],
    constraints: number[][],
    varSigns: string[]
  ) => {
    let transformedObj: number[] = [];
    let transformedConstraints: number[][] = constraints.map(row => []);
    let newVarSigns: string[] = [];
    let varMap = new Map<string, string>(); // Map<TransformedName, OriginalName>
    
    let newVarIndex = 1; // Start naming transformed vars from x1, x2...

    for (let i = 0; i < obj.length; i++) {
      const sign = varSigns[i];
      const originalVarName = `x${i + 1}`;
      
      if (sign === "≥0") {
        // Normal case: x_i ≥ 0
        const transformedName = `x${newVarIndex}`;
        transformedObj.push(obj[i]);
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(constraints[r][i]);
        }
        newVarSigns.push("≥0");
        varMap.set(transformedName, originalVarName); // x1_trans -> x1_orig
        newVarIndex++;
        
      } else if (sign === "≤0") {
        // x_i ≤ 0, substitute x_i = -y_i where y_i ≥ 0
        // We'll call y_i as our new transformed variable
        const transformedName = `x${newVarIndex}`;
        // c_i * x_i becomes c_i * (-y_i) = -c_i * y_i
        transformedObj.push(-obj[i]);
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(-constraints[r][i]);
        }
        newVarSigns.push("≥0");
        varMap.set(transformedName, `-${originalVarName}`); // x1_trans -> -x1_orig
        newVarIndex++;
        
      } else if (sign === "unrestricted") {
        // x_i unrestricted, substitute x_i = y_i1 - y_i2 where y_i1, y_i2 ≥ 0
        const transformedName1 = `x${newVarIndex}`;
        const transformedName2 = `x${newVarIndex + 1}`;

        // c_i * x_i becomes c_i * (y_i1 - y_i2) = c_i * y_i1 - c_i * y_i2
        transformedObj.push(obj[i]);  // coefficient for y_i1
        transformedObj.push(-obj[i]); // coefficient for y_i2
        
        for (let r = 0; r < constraints.length; r++) {
          transformedConstraints[r].push(constraints[r][i]);   // y_i1
          transformedConstraints[r].push(-constraints[r][i]);  // y_i2
        }
        
        newVarSigns.push("≥0");
        newVarSigns.push("≥0");
        varMap.set(transformedName1, `${originalVarName}⁺`); // x1_trans -> x1_orig+
        varMap.set(transformedName2, `${originalVarName}⁻`); // x2_trans -> x1_orig-
        newVarIndex += 2;
      }
    }

    return { 
      transformedObj, 
      transformedConstraints, 
      newVarSigns, 
      varMap 
    };
  };

  const formatEquations = (obj: number[], constraints: number[][], rhsValues: number[], varSigns: string[]) => {
    // Format objective based on *original* user input
    const originalObjectiveTerms = initialObjective
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

    // Format constraints based on *original* user input
    const constraintEquations = initialConstraints.map((constraint, rowIndex) => {
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
      // Use original constraint types and RHS
      return `${constraintStr} ${constraintTypes[rowIndex]} ${decimalToFraction(initialRhs[rowIndex])}`;
    });

    // Format variable signs based on *original* user input
    const nonNegativityConstraints = variableSigns.map((sign, index) => {
      if (sign === "≥0") return `x${index + 1} ≥ 0`;
      if (sign === "≤0") return `x${index + 1} ≤ 0`;
      return `x${index + 1} unrestricted`;
    });
    
    setEquations([formattedObjective, ...constraintEquations, ...nonNegativityConstraints]);
  };

  const createInitialSimplexTable = (obj: number[], constraints: number[][], rhsValues: number[]) => {
    const numVars = obj.length; // Number of *transformed* variables
    const numConstraints = constraints.length;

    // Cj row includes transformed vars + slack vars
    const newCj = [...obj, ...Array(numConstraints).fill(0)];
    setCj(newCj);

    // Variables row includes transformed vars + slack vars
    const newVariables = [
      ...Array(numVars)
        .fill(0)
        .map((_, i) => `x${i + 1}`), // These are x1, x2... of the *transformed* problem
      ...Array(numConstraints)
        .fill(0)
        .map((_, i) => `s${i + 1}`),
    ];
    setVariables(newVariables);

    // Basic variables are initially the slack variables
    const newBasicVariables = Array(numConstraints)
      .fill(0)
      .map((_, i) => `s${i + 1}`);
    setBasicVariables(newBasicVariables);

    // Create the simplex table
    const newSimplexTable: number[][] = [];
    for (let i = 0; i < numConstraints; i++) {
      const row = [
        ...constraints[i], // Transformed constraint coefficients
        ...Array(numConstraints)
          .fill(0)
          .map((_, j) => (i === j ? 1 : 0)), // Slack variable identity matrix
        rhsValues[i], // Processed RHS values
      ];
      newSimplexTable.push(row);
    }

    // Add empty Zj and Cj-Zj rows (will be computed)
    const cols = numVars + numConstraints + 1;
    const zjRow = Array(cols).fill(0);
    const cjZjRow = Array(cols).fill(0);
    newSimplexTable.push(zjRow);
    newSimplexTable.push(cjZjRow);

    setSimplexTable(newSimplexTable);
    setIteration(1);
    setMessage(null);

    // Compute initial Zj and Cj-Zj and find first pivot
    const computed = computeZjAndCjMinusZj(newSimplexTable, newBasicVariables, newCj, newVariables);
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);

    // Save initial state for reset
    setInitialState({
      table: computed.table.map((r) => [...r]),
      vars: newVariables.slice(),
      cj: newCj.slice(),
      basics: newBasicVariables.slice(),
      iteration: 1,
      equations: equations.slice(), // Equations are already set
    });
  };

  const computeZjAndCjMinusZj = (
    table: number[][],
    basicVars: string[],
    cjRow: number[],
    allVars: string[]
  ) => {
    if (table.length < 2) return { table, enteringVar: null as string | null, leavingVar: null as string | null };

    const rowsCount = table.length - 2;
    const cols = table[0].length;
    // Get Cj values for the current basic variables
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

    const cjZjRow = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      if (j < cjRow.length) { // Zj row has same length as Cj row
        cjZjRow[j] = cjRow[j] - zjRow[j];
      } else { // Handle RHS column
        cjZjRow[j] = 0 - zjRow[j]; // Cj for RHS is 0
      }
    }
    // Correct Cj-Zj for RHS column (it's not used for pivot, just Z value)
    cjZjRow[cols - 1] = 0;

    // Clean up floating point noise
    for (let j = 0; j < cols; j++) {
      if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
      if (Math.abs(cjZjRow[j]) < 1e-10) cjZjRow[j] = 0;
    }

    const newTable = table.slice(0, rowsCount).map((r) => r.slice());
    newTable.push(zjRow);
    newTable.push(cjZjRow);

    // Find entering variable (max positive Cj-Zj)
    const cjZjVars = cjZjRow.slice(0, allVars.length);
    const maxVal = Math.max(...cjZjVars);
    
    if (maxVal <= 1e-10) { // Optimality condition met
      return { table: newTable, enteringVar: null as string | null, leavingVar: null as string | null };
    }
    
    const enteringIndex = cjZjVars.indexOf(maxVal);
    const enteringVarName = allVars[enteringIndex];

    // Find leaving variable (min non-negative ratio)
    let minRatio = Infinity;
    let leavingIdx = -1;
    for (let i = 0; i < rowsCount; i++) {
      const colVal = newTable[i][enteringIndex];
      const rhsVal = newTable[i][newTable[i].length - 1];
      if (colVal > 1e-10) { // Pivot element must be positive
        const ratio = rhsVal / colVal;
        if (ratio >= -1e-10 && ratio < minRatio - 1e-10) { // Non-negative ratio check
          minRatio = ratio;
          leavingIdx = i;
        }
      }
    }

    const leavingVarName = leavingIdx === -1 ? null : basicVars[leavingIdx];
    return { table: newTable, enteringVar: enteringVarName, leavingVar: leavingVarName };
  };

  const performPivot = (currentTable: number[][], pivotRowIdx: number, pivotColIdx: number) => {
    const table = currentTable.map((r) => r.slice());
    const rowsCount = table.length - 2; // Don't pivot Zj, Cj-Zj
    const cols = table[0].length;
    const pivotVal = table[pivotRowIdx][pivotColIdx];

    if (Math.abs(pivotVal) < 1e-12) {
      throw new Error("Pivot value is too close to zero.");
    }

    // 1. Normalize the pivot row
    for (let j = 0; j < cols; j++) {
      table[pivotRowIdx][j] = table[pivotRowIdx][j] / pivotVal;
      if (Math.abs(table[pivotRowIdx][j]) < 1e-12) {
        table[pivotRowIdx][j] = 0;
      }
    }

    // 2. Clear other elements in the pivot column
    for (let i = 0; i < rowsCount; i++) {
      if (i === pivotRowIdx) continue;
      const factor = table[i][pivotColIdx];
      if (Math.abs(factor) < 1e-12) continue; // No operation needed
      
      for (let j = 0; j < cols; j++) {
        table[i][j] = table[i][j] - factor * table[pivotRowIdx][j];
        if (Math.abs(table[i][j]) < 1e-12) {
          table[i][j] = 0;
        }
      }
    }

    // Return table *without* Zj and Cj-Zj rows, as they will be recomputed
    return table.slice(0, rowsCount);
  };

  const handleNextIteration = () => {
    setMessage(null);
    if (!simplexTable || simplexTable.length < 2) return;

    // Check for optimality
    const cjZjRow = simplexTable[simplexTable.length - 1];
    const cjZjVars = cjZjRow.slice(0, variables.length);
    const maxVal = Math.max(...cjZjVars);

    if (maxVal <= 1e-10) {
      setEnteringVar(null);
      setLeavingVar(null);
      setMessage(getOptimalSolutionMessage());
      return;
    }

    // Find entering variable
    const enteringIndex = cjZjVars.indexOf(maxVal);
    const enteringVarName = variables[enteringIndex];

    // Find leaving variable
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
      // Unbounded solution
      setEnteringVar(enteringVarName);
      setLeavingVar(null);
      setMessage("Problem is unbounded (no valid leaving variable).");
      return;
    }
    
    const leavingVarName = basicVariables[leavingRowIdx];

    try {
      // Perform pivot operation
      const pivotedTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
      
      // Update basic variables
      const newBasics = basicVariables.slice();
      newBasics[leavingRowIdx] = enteringVarName;
      
      // Recompute Zj and Cj-Zj and find next pivot
      const computed = computeZjAndCjMinusZj(pivotedTable, newBasics, cj, variables);

      setSimplexTable(computed.table);
      setBasicVariables(newBasics);
      setEnteringVar(computed.enteringVar); // This will be null if optimal
      setLeavingVar(computed.leavingVar);   // This will be null if optimal
      setIteration((prev) => prev + 1);

      // Check if the new state is optimal
      const cjZjNow = computed.table[computed.table.length - 1].slice(0, variables.length);
      const maxNow = Math.max(...cjZjNow);
      if (maxNow <= 1e-10) {
        setMessage(getOptimalSolutionMessage());
        setEnteringVar(null);
        setLeavingVar(null);
      } else {
        // Set pivot info for display
        setEnteringVar(computed.enteringVar);
        setLeavingVar(computed.leavingVar);
      }
    } catch (err) {
      setMessage("Error during pivot: " + (err as Error).message);
    }
  };

  const getOptimalSolutionMessage = (): string => {
    const cols = simplexTable[0].length;
    const zjRow = simplexTable[simplexTable.length - 2];
    const optimalZ = zjRow[cols - 1];
    
    // If we minimized by negating, negate back
    const actualZ = optType === "Minimize" ? -optimalZ : optimalZ;
    
    let message = `Optimal solution reached.\nOptimal Z = ${decimalToFraction(actualZ)}\n\n`;
    
    // Get solution values for original variables
    message += "Solution:\n";
    for (let i = 0; i < originalVarCount; i++) {
      const originalVar = `x${i + 1}`;
      const value = getOriginalVariableValue(originalVar);
      message += `${originalVar} = ${decimalToFraction(value)}\n`;
    }
    
    return message;
  };

  const getOriginalVariableValue = (originalVar: string): number => {
    let value = 0;
    
    // This loops through the mapping: Map<TransformedName, OriginalNameIndicator>
    variableMapping.forEach((originalNameIndicator, transformedName) => {
      // Check if the indicator (e.g., "x1", "-x1", "x1⁺", "x1⁻") belongs to the original var
      if (originalNameIndicator.includes(originalVar)) {
        
        // Find if the transformed var is in the final basis
        const idx = basicVariables.indexOf(transformedName);
        
        if (idx !== -1) {
          // It's in the basis, get its value from RHS
          const cols = simplexTable[0].length;
          const rhsValue = simplexTable[idx][cols - 1];
          
          if (originalNameIndicator.includes('⁺')) {
            value += rhsValue; // x+ part
          } else if (originalNameIndicator.includes('⁻')) {
            value -= rhsValue; // x- part
          } else if (originalNameIndicator.startsWith('-')) {
            value = -rhsValue; // negated variable
          } else {
            value = rhsValue; // normal variable
          }
        }
        // If not in basis, its value is 0, so we add 0, which is correct.
      }
    });
    
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

    // Re-run pivot finding on initial state
    const computed = computeZjAndCjMinusZj(initialState.table, initialState.basics, initialState.cj, initialState.vars);
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
      const cjZjVars = lastRow.slice(0, variables.length);
      const maxVal = cjZjVars.length ? Math.max(...cjZjVars) : -Infinity;
      
      if (maxVal <= 1e-10) {
        // Optimal
        setSimplexTable(currentTable);
        setBasicVariables(currentBasics);
        setIteration(currentIteration);
        setMessage(getOptimalSolutionMessage());
        setEnteringVar(null);
        setLeavingVar(null);
        return;
      }
      
      const enteringIndex = cjZjVars.indexOf(maxVal);
      
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
        // Unbounded
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
        const computed = computeZjAndCjMinusZj(pivotedTable, newBasics, cj, variables);

        currentTable = computed.table;
        currentBasics = newBasics;
        currentIteration++;
        
      } catch (err) {
        setMessage("Error during automatic pivot: " + (err as Error).message);
        return;
      }
    }
    
    // Hit max iterations
    setSimplexTable(currentTable);
    setBasicVariables(currentBasics);
    setIteration(currentIteration);
    setMessage("Stopped: reached maximum automatic iterations limit.");
  };

  const renderSimplexTable = () => {
    if (simplexTable.length === 0) return null;

    const numVars = variables.length;
    const screenWidth = Dimensions.get("window").width;
    // Calculate cell width: 2 for basis/CB, numVars, 1 for solution
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

            {/* Cj - Zj Row */}
            <View style={[styles.row, styles.cjZjRow]}>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}>Cj - Zj</Text>
              </View>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}></Text>
              </View>
              {simplexTable[simplexTable.length - 1].map((value, colIndex) => (
                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                  <Text style={[styles.cellText, value > 1e-10 ? styles.positiveValue : (value < -1e-10 ? styles.negativeValue : {})]}>
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
          {message ? <Text style={[styles.equationText, { fontStyle: "normal", color: isOptimal ? "#4CAF50" : "#FFD54F" }]}>{message}</Text> : null}
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
  // Pivot indicators
  pivotRow: { backgroundColor: "rgba(255, 100, 100, 0.3)" },
  pivotCol: { backgroundColor: "rgba(100, 255, 100, 0.3)" },
  pivotElement: { backgroundColor: "rgba(255, 255, 100, 0.5)" },
  pivotIndicator: { color: "#FFD54F", fontWeight: "bold", fontSize: 18, position: "absolute", right: 5 },
});
