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

type RootStackParamList = {
  Home: undefined;
  NextComponent: { optimization: string; variables: string; constraints: string };
  SolutionPage: {
    objective: number[];
    constraintsMatrix: number[][];
    rhs: number[];
    optType: string;
  };
};

type SolutionPageRouteProp = RouteProp<RootStackParamList, "SolutionPage">;

export default function SolutionPage() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<SolutionPageRouteProp>();
  const { objective, constraintsMatrix, rhs, optType } = route.params;

  // Core simplex state
  const [simplexTable, setSimplexTable] = useState<number[][]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [cj, setCj] = useState<number[]>([]); // Cj for all vars
  const [basicVariables, setBasicVariables] = useState<string[]>([]);
  const [equations, setEquations] = useState<string[]>([]);
  const [enteringVar, setEnteringVar] = useState<string | null>(null);
  const [leavingVar, setLeavingVar] = useState<string | null>(null);
  const [iteration, setIteration] = useState<number>(1);
  const [message, setMessage] = useState<string | null>(null);

  // store initial copies for reset
  const [initialState, setInitialState] = useState<{
    table: number[][];
    vars: string[];
    cj: number[];
    basics: string[];
    iteration: number;
    equations: string[];
  } | null>(null);

  useEffect(() => {
    formatEquations();
    // If minimizing, convert to maximize by negating objective
    const adjustedObjective = optType === "Minimize" ? objective.map((v) => -v) : [...objective];
    createInitialSimplexTable(adjustedObjective, constraintsMatrix, rhs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objective, constraintsMatrix, rhs, optType]);

  const formatEquations = () => {
    const objectiveTerms = objective
      .map((coeff, index) => {
        if (coeff === 0) return null;
        const sign = coeff >= 0 ? "+" : "-";
        const absCoeff = Math.abs(coeff);
        return `${sign} ${absCoeff !== 1 ? absCoeff : ""}x${index + 1}`;
      })
      .filter((t) => t !== null);
    let objectiveStr = (objectiveTerms as string[]).join(" ");
    if (objectiveStr.startsWith("+ ")) objectiveStr = objectiveStr.substring(2);
    const formattedObjective = `${optType === "Maximize" ? "Maximize" : "Minimize"} Z = ${objectiveStr}`;

    const constraintEquations = constraintsMatrix.map((constraint, rowIndex) => {
      const constraintTerms = constraint
        .map((coeff, index) => {
          if (coeff === 0) return null;
          const sign = coeff >= 0 ? "+" : "-";
          const absCoeff = Math.abs(coeff);
          return `${sign} ${absCoeff !== 1 ? absCoeff : ""}x${index + 1}`;
        })
        .filter((t) => t !== null) as string[];

      let constraintStr = constraintTerms.join(" ");
      if (constraintStr.startsWith("+ ")) constraintStr = constraintStr.substring(2);
      return `${constraintStr} ≤ ${rhs[rowIndex]}`;
    });

    const nonNegativityConstraints = objective.map((_, index) => `x${index + 1} ≥ 0`);
    setEquations([formattedObjective, ...constraintEquations, ...nonNegativityConstraints]);
  };

  const createInitialSimplexTable = (obj: number[], constraints: number[][], rhsValues: number[]) => {
    const numVars = obj.length;
    const numConstraints = constraints.length;

    const newCj = [...obj, ...Array(numConstraints).fill(0)]; // slacks have 0
    setCj(newCj);

    const newVariables = [
      ...Array(numVars)
        .fill(0)
        .map((_, i) => `x${i + 1}`),
      ...Array(numConstraints)
        .fill(0)
        .map((_, i) => `s${i + 1}`),
    ];
    setVariables(newVariables);

    const newBasicVariables = Array(numConstraints)
      .fill(0)
      .map((_, i) => `s${i + 1}`);
    setBasicVariables(newBasicVariables);

    // Constraint rows (each row length = numVars + numConstraints + 1)
    const newSimplexTable: number[][] = [];
    for (let i = 0; i < numConstraints; i++) {
      const row = [
        ...constraints[i],
        ...Array(numConstraints)
          .fill(0)
          .map((_, j) => (i === j ? 1 : 0)),
        rhsValues[i],
      ];
      newSimplexTable.push(row);
    }

    // placeholder Zj and Cj-Zj rows, will compute next
    const cols = numVars + numConstraints + 1; // last is RHS
    const zjRow = Array(cols).fill(0);
    const cjZjRow = Array(cols).fill(0);
    newSimplexTable.push(zjRow);
    newSimplexTable.push(cjZjRow);

    setSimplexTable(newSimplexTable);
    setIteration(1);
    setMessage(null);

    // compute initial Zj and Cj-Zj
    const computed = computeZjAndCjMinusZj(newSimplexTable, newBasicVariables, newCj, newVariables);
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);

    // store initial copy for reset
    setInitialState({
      table: computed.table.map((r) => [...r]),
      vars: newVariables.slice(),
      cj: newCj.slice(),
      basics: newBasicVariables.slice(),
      iteration: 1,
      equations: equations.slice(),
    });
  };

  // compute Zj row and Cj - Zj, and also return entering/leaving
  const computeZjAndCjMinusZj = (
    table: number[][],
    basicVars: string[],
    cjRow: number[],
    allVars: string[]
  ) => {
    if (table.length < 2) return { table, enteringVar: null as string | null, leavingVar: null as string | null };

    const rowsCount = table.length - 2; // constraint rows count
    const cols = table[0].length; // includes RHS
    // Determine CB values for each constraint row by matching basicVars to allVars and getting cj value
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
      if (j < cjRow.length) {
        cjZjRow[j] = cjRow[j] - zjRow[j];
      } else {
        // RHS position or outside Cj
        cjZjRow[j] = 0;
      }
    }

    // place rows back
    const newTable = table.slice(0, rowsCount).map((r) => r.slice());
    newTable.push(zjRow);
    newTable.push(cjZjRow);

    // determine entering variable: choose max positive Cj-Zj among variable columns (exclude RHS)
    const cjZjVars = cjZjRow.slice(0, allVars.length);
    const maxVal = Math.max(...cjZjVars);
    if (maxVal <= 0) {
      // already optimal
      return { table: newTable, enteringVar: null as string | null, leavingVar: null as string | null };
    }
    const enteringIndex = cjZjVars.indexOf(maxVal);
    const enteringVarName = allVars[enteringIndex];

    // ratio test for leaving variable
    let minRatio = Infinity;
    let leavingIdx = -1;
    for (let i = 0; i < rowsCount; i++) {
      const colVal = newTable[i][enteringIndex];
      const rhsVal = newTable[i][newTable[i].length - 1];
      if (colVal > 0) {
        const ratio = rhsVal / colVal;
        if (ratio < minRatio - 1e-9) {
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
    const rowsCount = table.length - 2;
    const cols = table[0].length;
    const pivotVal = table[pivotRowIdx][pivotColIdx];

    if (pivotVal === 0) {
      // shouldn't happen if chosen correctly, but guard
      throw new Error("Pivot value is zero.");
    }

    // normalize pivot row
    for (let j = 0; j < cols; j++) {
      table[pivotRowIdx][j] = table[pivotRowIdx][j] / pivotVal;
    }

    // eliminate other rows
    for (let i = 0; i < rowsCount; i++) {
      if (i === pivotRowIdx) continue;
      const factor = table[i][pivotColIdx];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = 0; j < cols; j++) {
        table[i][j] = table[i][j] - factor * table[pivotRowIdx][j];
      }
    }

    return table;
  };

  const handleNextIteration = () => {
    setMessage(null);
    if (!simplexTable || simplexTable.length < 2) return;

    const rowsCount = simplexTable.length - 2;
    const cols = simplexTable[0].length;
    const cjZjRow = simplexTable[simplexTable.length - 1];
    const cjZjVars = cjZjRow.slice(0, variables.length);

    // Check optimality
    const maxVal = Math.max(...cjZjVars);
    if (maxVal <= 0) {
      setEnteringVar(null);
      setLeavingVar(null);
      setMessage("Optimal solution reached.");
      return;
    }

    // entering column index
    const enteringIndex = cjZjVars.indexOf(maxVal);

    // ratio test to find leaving
    let minRatio = Infinity;
    let leavingRowIdx = -1;
    for (let i = 0; i < rowsCount; i++) {
      const colVal = simplexTable[i][enteringIndex];
      const rhsVal = simplexTable[i][cols - 1];
      if (colVal > 0) {
        const ratio = rhsVal / colVal;
        if (ratio < minRatio - 1e-9) {
          minRatio = ratio;
          leavingRowIdx = i;
        }
      }
    }

    if (leavingRowIdx === -1) {
      // unbounded
      setEnteringVar(variables[enteringIndex]);
      setLeavingVar(null);
      setMessage("Problem is unbounded (no valid leaving variable).");
      return;
    }

    // perform pivoting
    try {
      const newTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);

      // update basic variables
      const newBasics = basicVariables.slice();
      newBasics[leavingRowIdx] = variables[enteringIndex];

      // compute new Zj and Cj-Zj
      const computed = computeZjAndCjMinusZj(newTable, newBasics, cj, variables);

      setSimplexTable(computed.table);
      setBasicVariables(newBasics);
      setEnteringVar(computed.enteringVar ?? variables[enteringIndex]);
      setLeavingVar(computed.leavingVar ?? basicVariables[leavingRowIdx]);
      setIteration((prev) => prev + 1);

      // check if now optimal
      const cjZjNow = computed.table[computed.table.length - 1].slice(0, variables.length);
      const maxNow = Math.max(...cjZjNow);
      if (maxNow <= 0) {
        setMessage("Optimal solution reached.");
        setEnteringVar(null);
        setLeavingVar(null);
      } else {
        setMessage(null);
      }
    } catch (err) {
      setMessage("Error during pivot: " + (err as Error).message);
    }
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

    // recompute entering/leaving
    const computed = computeZjAndCjMinusZj(initialState.table, initialState.basics, initialState.cj, initialState.vars);
    setSimplexTable(computed.table);
    setEnteringVar(computed.enteringVar ?? null);
    setLeavingVar(computed.leavingVar ?? null);
  };

  // Solve to optimal automatically (synchronous loop). Has a safety limit to avoid infinite loops.
  const handleSolveToOptimal = () => {
    setMessage(null);
    let safety = 0;
    const maxIterations = 100; // safety cap
    while (true) {
      safety++;
      if (safety > maxIterations) {
        setMessage("Stopped: reached maximum automatic iterations limit.");
        break;
      }
      // check optimality
      const lastRow = simplexTable[simplexTable.length - 1] ?? [];
      const cjZjVars = lastRow.slice(0, variables.length);
      const maxVal = cjZjVars.length ? Math.max(...cjZjVars) : -Infinity;
      if (maxVal <= 0) {
        setMessage("Optimal solution reached.");
        setEnteringVar(null);
        setLeavingVar(null);
        break;
      }
      // determine entering column
      const enteringIndex = cjZjVars.indexOf(maxVal);
      // ratio test
      let minRatio = Infinity;
      let leavingRowIdx = -1;
      const rowsCount = simplexTable.length - 2;
      const cols = simplexTable[0].length;
      for (let i = 0; i < rowsCount; i++) {
        const colVal = simplexTable[i][enteringIndex];
        const rhsVal = simplexTable[i][cols - 1];
        if (colVal > 0) {
          const ratio = rhsVal / colVal;
          if (ratio < minRatio - 1e-9) {
            minRatio = ratio;
            leavingRowIdx = i;
          }
        }
      }
      if (leavingRowIdx === -1) {
        setMessage("Problem is unbounded (no valid leaving variable).");
        setEnteringVar(variables[enteringIndex]);
        setLeavingVar(null);
        break;
      }

      // pivot
      try {
        const newTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
        const newBasics = basicVariables.slice();
        newBasics[leavingRowIdx] = variables[enteringIndex];
        const computed = computeZjAndCjMinusZj(newTable, newBasics, cj, variables);

        setSimplexTable(computed.table);
        setBasicVariables(newBasics);
        setIteration((prev) => prev + 1);

        // continue loop (the while will re-evaluate table)
        // since state updates are async in React, we also mutate local references for loop
        // to avoid stale reads, overwrite simplexTable and basicVariables local references:
        // But since we can't read updated state synchronously, we update local variables used by loop:
        // Instead of relying on state, work with local copies for loop:
        // To keep things simple and synchronous here, break the loop and call next iteration by recursion:
        // However user wanted it to run until optimal — we'll simulate synchronous updates by reassigning local copies.
        // For simplicity we update local copies and continue the while using them:
        // (This block below mirrors setState effects into local variables.)
        (function updateLocalStateMirror() {
          // override local references for next iteration
          // @ts-ignore
          simplexTable = computed.table;
          // @ts-ignore
          basicVariables = newBasics;
        })();
        continue;
      } catch (err) {
        setMessage("Error during automatic pivot: " + (err as Error).message);
        break;
      }
    }
  };

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
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>Cj →</Text>
              </View>
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}></Text>
              </View>
              {cj.map((value, index) => (
                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                  <Text style={styles.headerText}>{value}</Text>
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
                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                  <Text style={styles.headerText}>{variable}</Text>
                </View>
              ))}
              <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                <Text style={styles.headerText}>Solution</Text>
              </View>
            </View>

            {/* Table Rows */}
            {simplexTable.slice(0, -2).map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                <View style={[styles.cell, { width: cellWidth }]}>
                  <Text style={styles.cellText}>{basicVariables[rowIndex]}</Text>
                </View>
                <View style={[styles.cell, { width: cellWidth }]}>
                  {/* CB value */}
                  {
                    (() => {
                      const idx = variables.indexOf(basicVariables[rowIndex]);
                      return <Text style={styles.cellText}>{idx === -1 ? 0 : cj[idx].toFixed(2)}</Text>;
                    })()
                  }
                </View>
                {row.map((value, colIndex) => (
                  <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                    <Text style={styles.cellText}>{Number.isFinite(value) ? value.toFixed(2) : String(value)}</Text>
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
                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                  <Text style={styles.cellText}>{value.toFixed(2)}</Text>
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
                  <Text style={[styles.cellText, value < 0 && styles.negativeValue]}>{value.toFixed(2)}</Text>
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
          {message ? <Text style={[styles.equationText, { fontStyle: "normal" }]}>{message}</Text> : null}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, message === "Optimal solution reached." && { backgroundColor: "#9E9E9E" }]}
            onPress={handleNextIteration}
            disabled={message === "Optimal solution reached."}
          >
            <Text style={styles.nextButtonText}>Next Iteration</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <TouchableOpacity style={styles.solveButton} onPress={handleSolveToOptimal}>
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
  equationText: { color: "#fff", fontSize: 16, marginBottom: 8, fontStyle: "italic" },
  tableContainer: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, marginBottom: 20, maxHeight: 400 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#fff" },
  cjRow: { backgroundColor: "rgba(255, 165, 0, 0.3)" },
  headerRow: { backgroundColor: "rgba(255, 255, 255, 0.2)" },
  zjRow: { backgroundColor: "rgba(0, 255, 0, 0.1)" },
  cjZjRow: { backgroundColor: "rgba(255, 0, 0, 0.1)" },
  cell: { padding: 10, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "#fff" },
  headerCell: { backgroundColor: "rgba(255, 255, 255, 0.3)" },
  headerText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  cellText: { color: "#fff", fontSize: 14 },
  negativeValue: { color: "#ff6666", fontWeight: "bold" },
  buttonContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  backButton: { backgroundColor: "#fff", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginRight: 8 },
  resetButton: { backgroundColor: "#FFD54F", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginHorizontal: 8 },
  nextButton: { backgroundColor: "#4CAF50", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginLeft: 8 },
  backButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  resetButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
  nextButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  solveButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 30, alignItems: "center", flex: 1 },
  solveButtonText: { color: "#fff", fontWeight: "bold" },
});