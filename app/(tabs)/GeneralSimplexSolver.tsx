import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

const decimalToFraction = (decimal: number): string => {
    if (decimal === Infinity) return "∞";
    if (decimal === -Infinity) return "-∞";
    if (!Number.isFinite(decimal)) return "NaN";
    if (Math.abs(decimal) < 1e-10) return "0";

    const isNegative = decimal < 0;
    const absDecimal = Math.abs(decimal);
    const tolerance = 1.0e-9;
    const maxDenominator = 10000;

    let h1 = 1, h2 = 0;
    let k1 = 0, k2 = 1;
    let b = absDecimal;

    do {
        let a = Math.floor(b);
        let aux = h1;
        h1 = a * h1 + h2;
        h2 = aux;
        aux = k1;
        k1 = a * k1 + k2;
        k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(absDecimal - h1 / k1) > absDecimal * tolerance && k1 < maxDenominator);

    const numerator = h1;
    const denominator = k1;

    if (denominator === 1) {
        return isNegative ? `-${numerator}` : `${numerator}`;
    }
    return isNegative ? `-${numerator}/${denominator}` : `${numerator}/${denominator}`;
};

export default function GeneralSimplexSolver() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const initialTable = JSON.parse(params.initialTable as string);
    const variables = JSON.parse(params.variables as string);
    const initialBasicVars = JSON.parse(params.basicVariables as string);
    const cj = JSON.parse(params.cj as string);
    const optType = params.optType as string;
    const reason = params.reason as string;
    
    // Original data for sensitivity analysis
    const originalObjective = params.originalObjective ? JSON.parse(params.originalObjective as string) : cj;
    const variableSigns = params.variableSigns ? JSON.parse(params.variableSigns as string) : [];
    const constraintsMatrix = params.constraintsMatrix ? JSON.parse(params.constraintsMatrix as string) : [];
    const originalRHS = params.originalRHS ? JSON.parse(params.originalRHS as string) : [];

    const [simplexTable, setSimplexTable] = useState<number[][]>([]);
    const [basicVariables, setBasicVariables] = useState<string[]>([]);
    const [enteringVar, setEnteringVar] = useState<string | null>(null);
    const [leavingVar, setLeavingVar] = useState<string | null>(null);
    const [iteration, setIteration] = useState<number>(1);
    const [message, setMessage] = useState<string | null>(null);
    const [currentSolution, setCurrentSolution] = useState<Map<string, number>>(new Map());
    const [currentZValue, setCurrentZValue] = useState<number>(0);

    const [initialState, setInitialState] = useState<{
        table: number[][];
        basics: string[];
    } | null>(null);

    useEffect(() => {
        if (initialTable && variables && initialBasicVars && cj) {
            initializeSimplex();
        }
    }, [initialTable, variables, initialBasicVars, cj]);

    useEffect(() => {
        if (simplexTable.length > 0 && basicVariables.length > 0) {
            updateCurrentSolution();
        }
    }, [simplexTable, basicVariables]);

    const updateCurrentSolution = () => {
        if (!simplexTable || simplexTable.length < 2) return;

        const rhsCol = simplexTable[0].length - 1;
        const solutionMap = new Map<string, number>();

        variables.forEach((varName: string) => solutionMap.set(varName, 0));

        basicVariables.forEach((varName, rowIndex) => {
            const value = simplexTable[rowIndex][rhsCol];
            solutionMap.set(varName, value);
        });

        const zjRow = simplexTable[simplexTable.length - 2];
        const zValue = zjRow[rhsCol];

        setCurrentSolution(solutionMap);
        setCurrentZValue(zValue);
    };

    const initializeSimplex = () => {
        const table = initialTable.map((row: number[]) => [...row]);
        const basics = initialBasicVars.slice();

        const computed = computeZjAndZjMinusCj(table, basics);

        setSimplexTable(computed.table);
        setBasicVariables(basics);
        setEnteringVar(computed.enteringVar ?? null);
        setLeavingVar(computed.leavingVar ?? null);

        setInitialState({
            table: computed.table.map(r => [...r]),
            basics: basics.slice(),
        });

        if (computed.enteringVar === null) {
            setMessage("Table is already optimal!");
            Alert.alert("Already Optimal", "The current solution is optimal with the new parameters.");
        }
    };

    const computeZjAndZjMinusCj = (
        table: number[][],
        basicVars: string[]
    ) => {
        if (table.length < 1 || basicVars.length === 0) {
            return { table, enteringVar: null, leavingVar: null };
        }

        const rowsCount = table.length;
        const cols = table[0].length;

        const cb: number[] = basicVars.map((b) => {
            const idx = variables.indexOf(b);
            return idx === -1 ? 0 : (cj[idx] ?? 0);
        });

        // Calculate Zj row
        const zjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            let sum = 0;
            for (let i = 0; i < rowsCount; i++) {
                sum += (cb[i] || 0) * (table[i][j] || 0);
            }
            zjRow[j] = sum;
        }

        // Calculate Zj - Cj row
        const zjMinusCjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            if (j < cj.length) {
                zjMinusCjRow[j] = (zjRow[j] || 0) - (cj[j] || 0);
            } else {
                zjMinusCjRow[j] = zjRow[j] || 0;
            }
        }

        // Clean up near-zero values
        for (let j = 0; j < cols; j++) {
            if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
            if (Math.abs(zjMinusCjRow[j]) < 1e-10) zjMinusCjRow[j] = 0;
        }

        // Build new table with Zj and Zj-Cj rows
        const newTable = table.map((r) => r.slice());
        newTable.push(zjRow);
        newTable.push(zjMinusCjRow);

        // Check optimality and find entering variable
        const zjMinusCjVars = zjMinusCjRow.slice(0, variables.length);
        let enteringIndex = -1;

        if (optType === "Maximize") {
            // For MAXIMIZATION: optimal when all Zj - Cj <= 0
            // Enter on MOST POSITIVE Zj - Cj
            const maxVal = Math.max(...zjMinusCjVars);
            
            // If max value is <= 0, we're optimal
            if (maxVal <= 1e-10) {
                return { table: newTable, enteringVar: null, leavingVar: null };
            }
            
            // Enter the variable with most positive Zj - Cj
            enteringIndex = zjMinusCjVars.indexOf(maxVal);
        } else {
            // For MINIMIZATION: optimal when all Zj - Cj >= 0
            // Enter on MOST NEGATIVE Zj - Cj
            const minVal = Math.min(...zjMinusCjVars);
            
            // If min value is >= 0, we're optimal
            if (minVal >= -1e-10) {
                return { table: newTable, enteringVar: null, leavingVar: null };
            }
            
            // Enter the variable with most negative Zj - Cj
            enteringIndex = zjMinusCjVars.indexOf(minVal);
        }

        const enteringVarName = variables[enteringIndex];

        // Minimum ratio test for leaving variable
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

        // Perform row operations
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
        if (!simplexTable || simplexTable.length < 2) return;

        if (message?.includes("already") || message?.includes("Optimal")) {
            return;
        }

        if (!enteringVar || !leavingVar) {
            if (!leavingVar && enteringVar) {
                setMessage("Problem is unbounded.");
            }
            return;
        }

        setMessage(null);

        const leavingRowIdx = basicVariables.indexOf(leavingVar);
        const enteringColIdx = variables.indexOf(enteringVar);

        if (leavingRowIdx === -1 || enteringColIdx === -1) {
            setMessage("Error: Invalid pivot indices.");
            return;
        }

        try {
            const newTable = performPivot(simplexTable, leavingRowIdx, enteringColIdx);
            const newBasics = basicVariables.slice();
            newBasics[leavingRowIdx] = enteringVar;

            const computed = computeZjAndZjMinusCj(newTable, newBasics);

            setSimplexTable(computed.table);
            setBasicVariables(newBasics);
            setEnteringVar(computed.enteringVar ?? null);
            setLeavingVar(computed.leavingVar ?? null);
            setIteration((prev) => prev + 1);

            if (computed.enteringVar === null) {
                setMessage("Simplex complete. Optimal solution found!");
                Alert.alert("Solution Found", "New optimal solution reached!");
            }
        } catch (err) {
            setMessage("Error during pivot: " + (err as Error).message);
        }
    };

    const handleReset = () => {
        if (!initialState) return;

        setSimplexTable(initialState.table.map((r) => [...r]));
        setBasicVariables(initialState.basics.slice());
        setIteration(1);
        setMessage(null);

        const computed = computeZjAndZjMinusCj(
            initialState.table.slice(0, -2),
            initialState.basics
        );
        setEnteringVar(computed.enteringVar);
        setLeavingVar(computed.leavingVar);
        setSimplexTable(computed.table);
    };

    const handleSolveToOptimal = () => {
        setMessage(null);

        const solve = (
            currentTable: number[][],
            currentBasics: string[],
            currentIteration: number
        ): void => {
            const maxIterations = 100;

            if (currentIteration > maxIterations) {
                setMessage("Stopped: reached maximum iterations limit.");
                return;
            }

            const computed = computeZjAndZjMinusCj(
                currentTable.slice(0, -2),
                currentBasics
            );

            if (computed.enteringVar === null) {
                setMessage("Simplex complete. Optimal solution found!");
                setSimplexTable(computed.table);
                setBasicVariables(currentBasics);
                setEnteringVar(null);
                setLeavingVar(null);
                setIteration(currentIteration);
                Alert.alert("Solution Found", "New optimal solution reached!");
                return;
            }

            if (!computed.leavingVar) {
                setMessage("Problem is unbounded.");
                setSimplexTable(computed.table);
                setBasicVariables(currentBasics);
                setEnteringVar(computed.enteringVar);
                setLeavingVar(null);
                setIteration(currentIteration);
                return;
            }

            const leavingRowIdx = currentBasics.indexOf(computed.leavingVar);
            const enteringColIdx = variables.indexOf(computed.enteringVar);

            try {
                const newTable = performPivot(computed.table, leavingRowIdx, enteringColIdx);
                const newBasics = currentBasics.slice();
                newBasics[leavingRowIdx] = computed.enteringVar;

                setSimplexTable(newTable);
                setBasicVariables(newBasics);
                setIteration(currentIteration + 1);

                setTimeout(() => {
                    solve(newTable, newBasics, currentIteration + 1);
                }, 100);
            } catch (err) {
                setMessage("Error during automatic pivot: " + (err as Error).message);
            }
        };

        solve(simplexTable, basicVariables, iteration);
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
        router.push({
            pathname: "/SensitivityAnalysis",
            params: {
                finalTable: JSON.stringify(simplexTable.map(row => [...row])),
                variables: JSON.stringify(variables.slice()),
                basicVariables: JSON.stringify(basicVariables.slice()),
                cj: JSON.stringify(cj.slice()),
                optType: optType,
                originalObjective: JSON.stringify(originalObjective),
                variableSigns: JSON.stringify(variableSigns),
                constraintsMatrix: JSON.stringify(constraintsMatrix),
                originalRHS: JSON.stringify(originalRHS),
            }
        });
    };

    const renderSimplexTable = () => {
        if (!simplexTable || simplexTable.length < 2) return null;

        const screenWidth = Dimensions.get("window").width;
        const cellWidth = Math.max(80, screenWidth / (variables.length + 3));

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
                                <Text style={styles.headerText}>{" "}</Text>
                            </View>
                            {cj.map((value: number, index: number) => (
                                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                                    <Text style={styles.headerText}>{decimalToFraction(value)}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                                <Text style={styles.headerText}>{" "}</Text>
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
                            {variables.map((variable: string, index: number) => (
                                <View key={index} style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                                    <Text style={styles.headerText}>{variable}</Text>
                                </View>
                            ))}
                            <View style={[styles.cell, styles.headerCell, { width: cellWidth }]}>
                                <Text style={styles.headerText}>Solution</Text>
                            </View>
                        </View>

                        {/* Constraint Rows */}
                        {simplexTable.slice(0, -2).map((row, rowIndex) => {
                            const isLeavingRow = leavingVar === basicVariables[rowIndex];

                            return (
                                <View key={rowIndex} style={[
                                    styles.row,
                                    isLeavingRow && styles.pivotRowHighlight
                                ]}>
                                    <View style={[styles.cell, { width: cellWidth }]}>
                                        <Text style={styles.cellText}>{basicVariables[rowIndex]}</Text>
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
                                    {row.map((value, colIndex) => {
                                        const isEnteringCol = enteringVar === variables[colIndex];
                                        const isPivot = isLeavingRow && isEnteringCol;

                                        return (
                                            <View key={colIndex} style={[
                                                styles.cell,
                                                { width: cellWidth },
                                                isPivot && styles.pivotCell
                                            ]}>
                                                <Text style={styles.cellText}>
                                                    {decimalToFraction(value)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            );
                        })}

                        {/* Zj Row */}
                        <View style={[styles.row, styles.zjRow]}>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>Zj</Text>
                            </View>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                            {simplexTable[simplexTable.length - 2].map((value, colIndex) => (
                                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                                    <Text style={styles.cellText}>{decimalToFraction(value)}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Zj - Cj Row */}
                        <View style={[styles.row, styles.cjZjRow]}>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>Zj - Cj</Text>
                            </View>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                            {simplexTable[simplexTable.length - 1].map((value, colIndex) => {
                                let highlightStyle = {};
                                if (colIndex < variables.length) {
                                    // For Maximize: highlight POSITIVE values (can improve)
                                    // For Minimize: highlight NEGATIVE values (can improve)
                                    if (optType === "Maximize" && value > 1e-10) {
                                        highlightStyle = styles.positiveValue;
                                    } else if (optType === "Minimize" && value < -1e-10) {
                                        highlightStyle = styles.negativeValue;
                                    }
                                }

                                return (
                                    <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                                        <Text style={[styles.cellText, highlightStyle]}>
                                            {decimalToFraction(value)}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    };

    const renderCurrentSolution = () => {
        if (currentSolution.size === 0) return null;

        const decisionVars: string[] = [];
        currentSolution.forEach((value, varName) => {
            if (!varName.startsWith('s') && !varName.startsWith('e') && !varName.startsWith('a')) {
                decisionVars.push(varName);
            }
        });

        return (
            <View style={styles.solutionContainer}>
                <Text style={styles.solutionTitle}>Current Solution:</Text>
                <View style={styles.solutionGrid}>
                    <View style={styles.solutionRow}>
                        <Text style={styles.zValueLabel}>Z = </Text>
                        <Text style={styles.zValue}>{decimalToFraction(currentZValue)}</Text>
                    </View>
                    <View style={styles.divider} />
                    {decisionVars.map((varName) => {
                        const value = currentSolution.get(varName) || 0;
                        return (
                            <View key={varName} style={styles.solutionRow}>
                                <Text style={styles.varLabel}>{varName} = </Text>
                                <Text style={styles.varValue}>{decimalToFraction(value)}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>🔄 General Simplex Solver</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>Context:</Text>
                    <Text style={styles.infoText}>{reason}</Text>
                </View>

                {renderCurrentSolution()}

                <Text style={styles.subHeading}>Iteration {iteration}</Text>

                {renderSimplexTable()}

                <View style={styles.equationsContainer}>
                    <Text style={styles.subHeading}>Pivot Information:</Text>
                    <Text style={[styles.equationText, { color: "#4CAF50" }]}>
                        Entering Variable: {enteringVar ?? "None"}
                    </Text>
                    <Text style={[styles.equationText, { color: "#FF9800" }]}>
                        Leaving Variable: {leavingVar ?? "None"}
                    </Text>
                    {message && (
                        <Text style={[styles.equationText, { color: "#FFEB3B", fontStyle: "normal" }]}>
                            {message}
                        </Text>
                    )}
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                        <Text style={styles.resetButtonText}>Reset</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.nextButton,
                            (message?.includes("Optimal") || message?.includes("unbounded")) &&
                            { backgroundColor: "#9E9E9E" }
                        ]}
                        onPress={handleNextIteration}
                        disabled={message?.includes("Optimal") || message?.includes("unbounded")}
                    >
                        <Text style={styles.nextButtonText}>Next Iteration</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                        style={[
                            styles.solveButton,
                            (message?.includes("Optimal") || message?.includes("unbounded")) &&
                            { backgroundColor: "#9E9E9E" }
                        ]}
                        onPress={handleSolveToOptimal}
                        disabled={message?.includes("Optimal") || message?.includes("unbounded")}
                    >
                        <Text style={styles.solveButtonText}>Solve to Optimal</Text>
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
    infoBox: {
        backgroundColor: "rgba(33, 150, 243, 0.2)",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: "#2196F3",
    },
    infoTitle: { color: "#fff", fontSize: 16, fontWeight: "bold", marginBottom: 8 },
    infoText: { color: "#fff", fontSize: 14, lineHeight: 20 },
    solutionContainer: {
        backgroundColor: "rgba(76, 175, 80, 0.2)",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: "#4CAF50",
    },
    solutionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 12 },
    solutionGrid: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 10, borderRadius: 8 },
    solutionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
    zValueLabel: { color: "#FFEB3B", fontSize: 20, fontWeight: "bold", marginRight: 8 },
    zValue: { color: "#FFEB3B", fontSize: 20, fontWeight: "bold" },
    varLabel: { color: "#fff", fontSize: 16, fontWeight: "600", marginRight: 8, minWidth: 50 },
    varValue: { color: "#4CAF50", fontSize: 16, fontWeight: "bold" },
    divider: { height: 1, backgroundColor: "rgba(255, 255, 255, 0.3)", marginVertical: 8 },
    equationsContainer: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 15, borderRadius: 8, marginBottom: 20 },
    equationText: { color: "#fff", fontSize: 16, marginBottom: 8, fontWeight: "bold" },
    tableContainer: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, marginBottom: 20, minHeight: 200, overflow: "hidden" },
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
    positiveValue: { color: "#66ff66", fontWeight: "bold" },
    pivotRowHighlight: { backgroundColor: "rgba(255, 152, 0, 0.2)" },
    pivotCell: { backgroundColor: "rgba(255, 255, 0, 0.3)" },
    buttonContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
    backButton: { backgroundColor: "#fff", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginRight: 8 },
    resetButton: { backgroundColor: "#FFD54F", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginHorizontal: 8 },
    nextButton: { backgroundColor: "#4CAF50", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginLeft: 8 },
    backButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
    resetButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
    nextButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
    solveButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 30, alignItems: "center" },
    solveButtonText: { color: "#fff", fontWeight: "bold" },
    sensitivityButton: { backgroundColor: "#9C27B0", padding: 15, borderRadius: 30, alignItems: "center" },
    sensitivityButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});