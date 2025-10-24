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
import {
  useRoute,
  useNavigation,
  NavigationProp,
  RouteProp,
} from "@react-navigation/native";

// (decimalToFraction function is unchanged, included for completeness)
const decimalToFraction = (decimal: number): string => {
  // Handle special cases
  if (decimal === Infinity) return "∞";
  if (decimal === -Infinity) return "-∞";
  if (!Number.isFinite(decimal)) return "NaN";
  if (decimal === 0) return "0";

  // Handle very small numbers that should be treated as zero
  if (Math.abs(decimal) < 1e-10) return "0";

  // Handle negative numbers
  const isNegative = decimal < 0;
  const absDecimal = Math.abs(decimal);

  // If it's a whole number, return it directly
  if (Math.abs(absDecimal - Math.round(absDecimal)) < 1e-10) {
    return isNegative ? `-${Math.round(absDecimal)}` : `${Math.round(absDecimal)}`;
  }

  // Convert to fraction using continued fractions algorithm
  const tolerance = 1.0e-10;
  let h1 = 1,
    h2 = 0,
    k1 = 0,
    k2 = 1;
  let b = absDecimal;
  let iterations = 0;
  const maxIterations = 50; // Prevent infinite loops

  while (iterations < maxIterations) {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;

    // Check if we've found a good approximation
    if (k1 !== 0 && Math.abs(absDecimal - h1 / k1) <= absDecimal * tolerance) {
      break;
    }

    // Prepare for next iteration
    if (Math.abs(b - a) < tolerance) break;
    b = 1 / (b - a);
    if (!Number.isFinite(b)) break;
    iterations++;
  }

  // Handle edge cases
  if (k1 === 0 || !Number.isFinite(h1) || !Number.isFinite(k1)) {
    // Fall back to decimal representation with limited precision
    return parseFloat(decimal.toFixed(6)).toString();
  }

  // Simplify the fraction if possible
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

  // Format the result
  if (denominator === 1) {
    return isNegative ? `-${numerator}` : `${numerator}`;
  }

  // Check if the fraction is too complex, if so return decimal
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
  Phase1: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
    constraintTypes: string[];
    variableSigns: string[];
  };
  Phase2: {
    originalObjective: number[];
    phase1Table: number[][];
    phase1Variables: string[];
    phase1BasicVariables: string[];
    optType: string;
    variableSigns: string[];
    transformedVariableNames: string[];
  };
};

type Phase2RouteProp = RouteProp<RootStackParamList, "Phase2">;

export default function Phase2() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<Phase2RouteProp>();
  // Destructure new props
  const {
    originalObjective,
    phase1Table,
    phase1Variables,
    phase1BasicVariables,
    optType,
    variableSigns,
    transformedVariableNames,
  } = route.params;

  // Core Phase 2 state
  const [simplexTable, setSimplexTable] = useState<number[][]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [cj, setCj] = useState<number[]>([]);
  const [basicVariables, setBasicVariables] = useState<string[]>([]);
  const [equations, setEquations] = useState<string[]>([]);
  const [enteringVar, setEnteringVar] = useState<string | null>(null);
  const [leavingVar, setLeavingVar] = useState<string | null>(null);
  const [iteration, setIteration] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);

  // Store initial copies for reset
  const [initialState, setInitialState] = useState<{
    table: number[][];
    vars: string[];
    cj: number[];
    basics: string[];
    iteration: number;
    equations: string[];
  } | null>(null);

  useEffect(() => {
    // Only create Phase 2 table if all required parameters are available
    if (
      originalObjective &&
      phase1Table &&
      phase1Variables &&
      phase1BasicVariables &&
      optType &&
      variableSigns &&
      transformedVariableNames
    ) {
      createPhase2Table();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originalObjective,
    phase1Table,
    phase1Variables,
    phase1BasicVariables,
    optType,
    variableSigns,
    transformedVariableNames,
  ]); // Add new dependencies

  /**
   * [MODIFIED] Now returns the equations array to fix async state bug.
   */
  const formatEquations = (
    phase2Objective: number[],
    allVars: string[]
  ): string[] => {
    // Create Phase 2 objective display with actual coefficients
    const objectiveTerms = phase2Objective
      .map((coeff, index) => {
        if (Math.abs(coeff) < 1e-10) return null;
        // Handle maximization logic (if min problem, Cj is negated)
        const displayCoeff = optType === "Minimize" ? -coeff : coeff;
        const sign = displayCoeff >= 0 ? "+" : "-";
        const absCoeff = Math.abs(displayCoeff);
        const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
        return `${sign} ${coeffStr}${allVars[index]}`;
      })
      .filter((t) => t !== null);

    let objectiveStr = (objectiveTerms as string[]).join(" ");
    if (objectiveStr.startsWith("+ ")) objectiveStr = objectiveStr.substring(2);
    if (objectiveStr === "") objectiveStr = "0";

    // We are *always* Maximizing in Phase 2 (since Min Z = -Max(-Z))
    // But we display the original problem type
    const formattedObjective = `${
      optType === "Maximize" ? "Maximize" : "Minimize"
    } Z = ${objectiveStr}`;

    // Add constraint info
    const constraintInfo =
      "Subject to: Constraints from Phase I (artificial variables removed)";
    const nonNegativityConstraints = allVars.map(
      (varName) => `${varName} \u2265 0` // Using unicode for ≥
    );

    const newEquations = [
      formattedObjective,
      constraintInfo,
      ...nonNegativityConstraints,
    ];
    
    setEquations(newEquations); // Set state for UI
    return newEquations; // Return for synchronous use
  };

  /**
   * [NEW] Helper function to calculate and display the final solution.
   */
  const displayFinalSolution = (
    finalTable: number[][],
    finalBasics: string[],
    allVars: string[]
  ) => {
    const solutionMap = new Map<string, number>();
    const rhsCol = finalTable[0].length - 1;

    // 1. Set all variables to 0 by default
    allVars.forEach((varName) => solutionMap.set(varName, 0));

    // 2. Set basic variables to their solution values
    finalBasics.forEach((varName, rowIndex) => {
      const value = finalTable[rowIndex][rhsCol];
      solutionMap.set(varName, value);
    });

    // 3. Reconstruct original variables (x1, x2, etc.)
    const originalSolution = new Map<string, number>();
    const numOriginalVars = variableSigns.length;

    for (let i = 0; i < numOriginalVars; i++) {
      const varName = `x${i + 1}`;
      const sign = variableSigns[i];
      let value = 0;

      if (sign === "≥0") {
        value = solutionMap.get(varName) || 0;
      } else if (sign === "≤0") {
        const primeVar = `${varName}'`; // e.g., x1'
        value = -(solutionMap.get(primeVar) || 0); // x1 = -x1'
      } else if (sign === "unrestricted") {
        const primeVar = `${varName}'`;
        const doublePrimeVar = `${varName}''`;
        value =
          (solutionMap.get(primeVar) || 0) -
          (solutionMap.get(doublePrimeVar) || 0);
      }
      originalSolution.set(varName, value);
    }

    // 4. Get the Z value (which is Zj for the RHS column)
    const zjRow = finalTable[finalTable.length - 2];
    let zValue = zjRow[rhsCol];

    // 5. Adjust Z if it was a Minimize problem
    // We maximized -Z. So Z_optimal = -(-Z_optimal_value)
    if (optType === "Minimize") {
      zValue = -zValue;
    }

    // 6. Format the solution string
    const solutionParts: string[] = [];
    originalSolution.forEach((value, varName) => {
      solutionParts.push(`${varName} = ${decimalToFraction(value)}`);
    });
    const solutionString = solutionParts.join(", ");

    const finalMessage = `Optimal Solution Found:\nZ = ${decimalToFraction(
      zValue
    )}\nAt: ${solutionString}`;

    // Use Alert to show the final solution clearly
    Alert.alert("Solution Found", finalMessage);
    setMessage(finalMessage); // Also set it in the UI message area
  };

  /**
   * [MODIFIED] Fixed asynchronous state bugs.
   */
  const createPhase2Table = () => {
    // Add safety checks
    if (
      !phase1Variables ||
      !Array.isArray(phase1Variables) ||
      !phase1Table ||
      !Array.isArray(phase1Table) ||
      !originalObjective ||
      !Array.isArray(originalObjective) ||
      !phase1BasicVariables ||
      !Array.isArray(phase1BasicVariables) ||
      !variableSigns ||
      !Array.isArray(variableSigns) ||
      !transformedVariableNames ||
      !Array.isArray(transformedVariableNames)
    ) {
      console.error("Missing or invalid parameters for Phase 2.");
      setMessage("Error: Failed to load Phase 2 data.");
      return;
    }

    // Remove artificial variables
    const filteredVariables: string[] = [];
    const artificialIndices: number[] = [];

    phase1Variables.forEach((varName, index) => {
      if (varName.startsWith("a")) {
        artificialIndices.push(index);
      } else {
        filteredVariables.push(varName);
      }
    });

    setVariables(filteredVariables);

    // --- Rebuild Phase 2 Cj row ---
    const transformedObjectiveCoeffs: number[] = [];
    const signs = variableSigns || Array(originalObjective.length).fill("≥0");

    signs.forEach((sign, index) => {
      const coeff = originalObjective[index] || 0;
      if (sign === "≥0") {
        transformedObjectiveCoeffs.push(coeff);
      } else if (sign === "≤0") {
        transformedObjectiveCoeffs.push(-coeff);
      } else if (sign === "unrestricted") {
        transformedObjectiveCoeffs.push(coeff);
        transformedObjectiveCoeffs.push(-coeff);
      }
    });

    const coeffMap = new Map<string, number>();
    transformedVariableNames.forEach((name, index) => {
      coeffMap.set(name, transformedObjectiveCoeffs[index] || 0);
    });

    const phase2Objective: number[] = [];
    for (const varName of filteredVariables) {
      if (coeffMap.has(varName)) {
        let coeff = coeffMap.get(varName)!;
        if (optType === "Minimize") {
          coeff = -coeff;
        }
        phase2Objective.push(coeff);
      } else {
        phase2Objective.push(0); // Slack/surplus
      }
    }
    // --- End of Cj rebuild ---

    setCj(phase2Objective);

    // Remove artificial variable columns
    const phase2Table: number[][] = [];
    const constraintRows = phase1Table.slice(0, -2);

    for (let i = 0; i < constraintRows.length; i++) {
      const newRow: number[] = [];
      for (let j = 0; j < phase1Variables.length; j++) {
        if (!artificialIndices.includes(j)) {
          newRow.push(constraintRows[i][j]);
        }
      }
      if (constraintRows[i].length > 0) {
        newRow.push(constraintRows[i][constraintRows[i].length - 1]);
      }
      phase2Table.push(newRow);
    }

    // Update basic variables
    const newBasicVariables = phase1BasicVariables.filter(
      (varName) => !varName.startsWith("a")
    );

    // [FIX] Use a local variable to prevent async state issues
    let finalBasicVariables: string[];
    
    if (newBasicVariables.length !== constraintRows.length) {
      console.warn(
        "Phase 1 ended with artificial variables in the basis. Phase 2 may be incorrect."
      );
      finalBasicVariables = phase1BasicVariables.slice(0, constraintRows.length);
      setBasicVariables(finalBasicVariables);
    } else {
      finalBasicVariables = newBasicVariables;
      setBasicVariables(finalBasicVariables);
    }

    // Add placeholder Zj and Cj-Zj rows
    const cols = filteredVariables.length + 1;
    const zjRow = Array(cols).fill(0);
    const cjZjRow = Array(cols).fill(0);
    phase2Table.push(zjRow);
    phase2Table.push(cjZjRow);

    setSimplexTable(phase2Table);
    setIteration(1);
    setMessage(null);

    // [FIX] Capture returned equations to prevent async state issues
    const newEquations = formatEquations(phase2Objective, filteredVariables);

    // Compute initial Zj and Cj-Zj for Phase 2
    // [FIX] Pass the local `finalBasicVariables` not the state variable
    const computed = computeZjAndCjMinusZj(
      phase2Table,
      finalBasicVariables,
      phase2Objective,
      filteredVariables
    );
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);

    // [NEW] Check if the initial table is already optimal
    if (computed.enteringVar === null) {
      const cjZjVars = computed.table[computed.table.length - 1].slice(
        0,
        filteredVariables.length
      );
      const maxVal = cjZjVars.length ? Math.max(...cjZjVars) : -Infinity;
      if (maxVal <= 1e-10) {
        setMessage("Phase 2 complete. Optimal solution found.");
        displayFinalSolution(
          computed.table,
          finalBasicVariables,
          filteredVariables
        );
      }
    }

    // Store initial state for reset
    // [FIX] Use the local, synchronous variables
    setInitialState({
      table: computed.table.map((r) => [...r]),
      vars: filteredVariables.slice(),
      cj: phase2Objective.slice(),
      basics: finalBasicVariables.slice(),
      iteration: 1,
      equations: newEquations.slice(),
    });
  };

  // (computeZjAndCjMinusZj function is unchanged, it was correct)
  const computeZjAndCjMinusZj = (
    table: number[][],
    basicVars: string[],
    cjRow: number[],
    allVars: string[]
  ) => {
    if (table.length < 2 || basicVars.length === 0 || table[0].length === 0) {
      return {
        table,
        enteringVar: null as string | null,
        leavingVar: null as string | null,
      };
    }

    const rowsCount = table.length - 2;
    const cols = table[0].length;

    // Determine CB values
    const cb: number[] = basicVars.map((b) => {
      const idx = allVars.indexOf(b);
      if (idx === -1) {
        console.warn(`Basic variable ${b} not found in allVars list.`);
        return 0;
      }
      return cjRow[idx] ?? 0;
    });

    const zjRow = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let i = 0; i < rowsCount; i++) {
        sum += (cb[i] || 0) * (table[i][j] || 0);
      }
      zjRow[j] = sum;
    }

    const cjZjRow = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      if (j < cjRow.length) {
        cjZjRow[j] = (cjRow[j] || 0) - (zjRow[j] || 0);
      } else {
        cjZjRow[j] = 0 - (zjRow[j] || 0); // For RHS
      }
    }

    // Clean up very small numbers
    for (let j = 0; j < cols; j++) {
      if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
      if (Math.abs(cjZjRow[j]) < 1e-10) cjZjRow[j] = 0;
    }

    // Update table
    const newTable = table.slice(0, rowsCount).map((r) => r.slice());
    newTable.push(zjRow);
    newTable.push(cjZjRow);

    // For Phase 2 (maximization), choose max positive Cj-Zj
    const cjZjVars = cjZjRow.slice(0, allVars.length);
    if (cjZjVars.length === 0) {
      return { table: newTable, enteringVar: null, leavingVar: null };
    }

    const maxVal = Math.max(...cjZjVars);
    if (maxVal <= 1e-10) {
      // Phase 2 optimal
      return {
        table: newTable,
        enteringVar: null as string | null,
        leavingVar: null as string | null,
      };
    }
    const enteringIndex = cjZjVars.indexOf(maxVal);
    const enteringVarName = allVars[enteringIndex];

    // Ratio test for leaving variable
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
    return {
      table: newTable,
      enteringVar: enteringVarName,
      leavingVar: leavingVarName,
    };
  };

  // (performPivot function is unchanged)
  const performPivot = (
    currentTable: number[][],
    pivotRowIdx: number,
    pivotColIdx: number
  ) => {
    const table = currentTable.map((r) => r.slice());
    const rowsCount = table.length - 2;
    const cols = table[0].length;
    const pivotVal = table[pivotRowIdx][pivotColIdx];

    if (Math.abs(pivotVal) < 1e-12) {
      throw new Error("Pivot value is too close to zero.");
    }

    // Normalize pivot row
    for (let j = 0; j < cols; j++) {
      table[pivotRowIdx][j] = table[pivotRowIdx][j] / pivotVal;
      if (Math.abs(table[pivotRowIdx][j]) < 1e-12) {
        table[pivotRowIdx][j] = 0;
      }
    }

    // Eliminate other rows
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

  /**
   * [MODIFIED] Added call to displayFinalSolution and fixed unbounded typo.
   */
  const handleNextIteration = () => {
    setMessage(null);
    if (!simplexTable || simplexTable.length < 2) return;

    const rowsCount = simplexTable.length - 2;
    const cols = simplexTable[0].length;
    const cjZjRow = simplexTable[simplexTable.length - 1];
    const cjZjVars = cjZjRow.slice(0, variables.length);

    // Check Phase 2 optimality (maximization - all Cj-Zj <= 0)
    if (cjZjVars.length === 0) {
      setMessage("Phase 2 complete. Optimal solution found.");
      displayFinalSolution(simplexTable, basicVariables, variables);
      return;
    }
    const maxVal = Math.max(...cjZjVars);
    if (maxVal <= 1e-10) {
      setEnteringVar(null);
      setLeavingVar(null);
      setMessage("Phase 2 complete. Optimal solution found.");
      displayFinalSolution(simplexTable, basicVariables, variables);
      return;
    }

    // Continue Phase 2 iterations
    const enteringIndex = cjZjVars.indexOf(maxVal);

    // Ratio test
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
      setEnteringVar(variables[enteringIndex]);
      setLeavingVar(null); // [FIX] Corrected typo from setLeavingRowIdx
      setMessage("Phase 2 problem is unbounded.");
      return;
    }

    // Perform pivoting
    try {
      const newTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
      const newBasics = basicVariables.slice();
      newBasics[leavingRowIdx] = variables[enteringIndex];

      const computed = computeZjAndCjMinusZj(
        newTable,
        newBasics,
        cj,
        variables
      );

      setSimplexTable(computed.table);
      setBasicVariables(newBasics);
      setEnteringVar(computed.enteringVar ?? variables[enteringIndex]);
      setLeavingVar(computed.leavingVar ?? basicVariables[leavingRowIdx]);
      setIteration((prev) => prev + 1);

      // Check if now optimal
      const cjZjNow = computed.table[computed.table.length - 1].slice(
        0,
        variables.length
      );
      const maxNow = Math.max(...cjZjNow);
      if (maxNow <= 1e-10) {
        setMessage("Phase 2 complete. Optimal solution found.");
        displayFinalSolution(computed.table, newBasics, variables); // [NEW] Show solution
        setEnteringVar(null);
        setLeavingVar(null);
      } else {
        setMessage(null);
      }
    } catch (err) {
      setMessage("Error during pivot: " + (err as Error).message);
    }
  };

  /**
   * [MODIFIED] Fixed async state bug on reset.
   */
  const handleReset = () => {
    if (!initialState) return;
    
    // [FIX] Must use the stored initial state values, not computed ones
    setSimplexTable(initialState.table.map((r) => [...r]));
    setVariables(initialState.vars.slice());
    setCj(initialState.cj.slice());
    setBasicVariables(initialState.basics.slice());
    setIteration(initialState.iteration);
    setEquations(initialState.equations.slice());
    setMessage(null);

    // Recompute entering/leaving from the clean initial table
    const computed = computeZjAndCjMinusZj(
      initialState.table,
      initialState.basics,
      initialState.cj,
      initialState.vars
    );
    // Note: The table is already computed, but we need the entering/leaving vars
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);
  };

  /**
   * [MODIFIED] Added call to displayFinalSolution.
   */
  const handleSolveToOptimal = () => {
    setMessage(null);

    const solve = (
      currentTable: number[][],
      currentBasics: string[],
      currentIteration: number
    ): void => {
      const maxIterations = 100;

      if (currentIteration > maxIterations) {
        setMessage("Stopped: reached maximum automatic iterations limit.");
        return;
      }

      // Check optimality for Phase 2
      const lastRow = currentTable[currentTable.length - 1] ?? [];
      const cjZjVars = lastRow.slice(0, variables.length);
      const maxVal = cjZjVars.length ? Math.max(...cjZjVars) : -Infinity;

      if (maxVal <= 1e-10) {
        setMessage("Phase 2 complete. Optimal solution found.");
        displayFinalSolution(currentTable, currentBasics, variables); // [NEW] Show solution
        setEnteringVar(null);
        setLeavingVar(null);
        return;
      }

      // Continue solving
      const enteringIndex = cjZjVars.indexOf(maxVal);

      let minRatio = Infinity;
      let leavingRowIdx = -1;
      const rowsCount = currentTable.length - 2;
      const cols = currentTable[0].length;

      for (let i = 0; i < rowsCount; i++) {
        const colVal = currentTable[i][enteringIndex];
        const rhsVal = currentTable[i][cols - 1];
        if (colVal > 1e-10) {
          const ratio = rhsVal / colVal;
          if (ratio >= -1e-10 && ratio < minRatio - 1e-10) {
            minRatio = ratio;
            leavingRowIdx = i;
          }
        }
      }

      if (leavingRowIdx === -1) {
        setMessage("Phase 2 problem is unbounded.");
        setEnteringVar(variables[enteringIndex]);
        setLeavingVar(null);
        return;
      }

      try {
        const newTable = performPivot(currentTable, leavingRowIdx, enteringIndex);
        const newBasics = currentBasics.slice();
        newBasics[leavingRowIdx] = variables[enteringIndex];
        const computed = computeZjAndCjMinusZj(
          newTable,
          newBasics,
          cj,
          variables
        );

        setSimplexTable(computed.table);
        setBasicVariables(newBasics);
        setIteration(currentIteration + 1);

        // Use a short timeout for a (very) basic animation effect
        setTimeout(() => {
          solve(computed.table, newBasics, currentIteration + 1);
        }, 50); // Reduced delay for faster solve
      } catch (err) {
        setMessage("Error during automatic pivot: " + (err as Error).message);
      }
    };

    // Start solving from the current state
    solve(simplexTable, basicVariables, iteration);
  };
  
  // (renderSimplexTable function is unchanged)
  const renderSimplexTable = () => {
    if (simplexTable.length === 0) return null;

    const numVars = variables.length;
    const screenWidth = Dimensions.get("window").width;
    const cellWidth = Math.max(70, screenWidth / (numVars + 3));

    return (
      <View style={styles.tableContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View>
            {/* CJ Row */}
            <View style={[styles.row, styles.cjRow]}>
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}>Cj →</Text>
              </View>
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}></Text>
              </View>
              {cj.map((value, index) => (
                <View
                  key={index}
                  style={[styles.cell, styles.headerCell, { width: cellWidth }]}
                >
                  <Text style={styles.headerText}>
                    {decimalToFraction(value)}
                  </Text>
                </View>
              ))}
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}></Text>
              </View>
            </View>

            {/* Header Row */}
            <View style={[styles.row, styles.headerRow]}>
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}>Basis</Text>
              </View>
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}>CB</Text>
              </View>
              {variables.map((variable, index) => (
                <View
                  key={index}
                  style={[styles.cell, styles.headerCell, { width: cellWidth }]}
                >
                  <Text style={styles.headerText}>{variable}</Text>
                </View>
              ))}
              <View
                style={[styles.cell, styles.headerCell, { width: cellWidth }]}
              >
                <Text style={styles.headerText}>Solution</Text>
              </View>
            </View>

            {/* Table Rows */}
            {simplexTable.slice(0, -2).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                <View style={[styles.cell, { width: cellWidth }]}>
                  <Text style={styles.cellText}>
                    {basicVariables[rowIndex]}
                  </Text>
                </View>
                <View style={[styles.cell, { width: cellWidth }]}>
                  {(() => {
                    const idx = variables.indexOf(basicVariables[rowIndex]);
                    return (
                      <Text style={styles.cellText}>
                        {idx === -1 ? "0" : decimalToFraction(cj[idx])}
                      </Text>
                    );
                  })()}
                </View>
                {row.map((value, colIndex) => (
                  <View
                    key={colIndex}
                    style={[styles.cell, { width: cellWidth }]}
                  >
                    <Text style={styles.cellText}>
                      {decimalToFraction(value)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Zj Row */}
            <View style={[styles.row, styles.zjRow]}>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}>Zj</Text>
              </View>
              <View style={[styles.cell, { width: cellWidth }]}>
                <Text style={styles.cellText}></Text>
              </View>
              {simplexTable[simplexTable.length - 2].map((value, colIndex) => (
                <View
                  key={colIndex}
                  style={[styles.cell, { width: cellWidth }]}
                >
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
                <View
                  key={colIndex}
                  style={[styles.cell, { width: cellWidth }]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      value > 1e-10 && styles.positiveValue,
                    ]}
                  >
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

  // (handleGoBack function is unchanged)
  const handleGoBack = () => {
    navigation.goBack();
  };

  // (Return/JSX is unchanged)
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>Two-Phase Method: Phase II</Text>

        <View style={styles.equationsContainer}>
          <Text style={styles.subHeading}>Phase II Problem:</Text>
          {equations.map((equation, index) => (
            <Text key={index} style={styles.equationText}>
              {equation}
            </Text>
          ))}
        </View>

        <Text style={styles.subHeading}>
          Phase II Table (Iteration {iteration})
        </Text>

        {renderSimplexTable()}

        {/* Pivot information */}
        <View style={styles.equationsContainer}>
          <Text style={styles.subHeading}>Pivot Information:</Text>
          <Text style={styles.equationText}>
            Entering Variable: {enteringVar ?? "None"}
          </Text>
          <Text style={styles.equationText}>
            Leaving Variable: {leavingVar ?? "None"}
          </Text>
          {message ? (
            <Text
              style={[
                styles.equationText,
                { fontStyle: "normal", color: "#66ff66" }, // Make message standout
              ]}
            >
              {message}
            </Text>
          ) : null}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              (message?.includes("complete") || message?.includes("unbounded")) && { backgroundColor: "#9E9E9E" },
            ]}
            onPress={handleNextIteration}
            disabled={message?.includes("complete") || message?.includes("unbounded")}
          >
            <Text style={styles.nextButtonText}>Next Iteration</Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity
            style={[
              styles.solveButton,
              (message?.includes("complete") || message?.includes("unbounded")) && { backgroundColor: "#9E9E9E" },
            ]}
            onPress={handleSolveToOptimal}
            disabled={message?.includes("complete") || message?.includes("unbounded")}
          >
            <Text style={styles.solveButtonText}>Solve to Optimal</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// (Styles are unchanged)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#3b5998" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  heading: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subHeading: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 15,
    textAlign: "center",
  },
  equationsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  equationText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 8,
    fontStyle: "italic",
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 8,
    marginBottom: 20,
    minHeight: 200,
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#fff" },
  cjRow: { backgroundColor: "rgba(255, 165, 0, 0.3)" },
  headerRow: { backgroundColor: "rgba(255, 255, 255, 0.2)" },
  zjRow: { backgroundColor: "rgba(0, 255, 0, 0.1)" },
  cjZjRow: { backgroundColor: "rgba(255, 0, 0, 0.1)" },
  cell: {
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#fff",
  },
  headerCell: { backgroundColor: "rgba(255, 255, 255, 0.3)" },
  headerText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  cellText: { color: "#fff", fontSize: 14 },
  positiveValue: { color: "#66ff66", fontWeight: "bold" },
  negativeValue: { color: "#ff6666", fontWeight: "bold" },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  backButton: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 30,
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  resetButton: {
    backgroundColor: "#FFD54F",
    padding: 12,
    borderRadius: 30,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 8,
  },
  nextButton: {
    backgroundColor: "#4CAF50",
    padding: 12,
    borderRadius: 30,
    alignItems: "center",
    flex: 1,
    marginLeft: 8,
  },
  backButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  resetButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  nextButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  solveButton: {
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 30,
    alignItems: "center",
    flex: 1,
  },
  solveButtonText: { color: "#fff", fontWeight: "bold" },
});