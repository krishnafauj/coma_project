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

// Decimal to Fraction conversion
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

export default function DualSimplexSolver() {
    const router = useRouter();
    const params = useLocalSearchParams();
    
    const initialTable = JSON.parse(params.initialTable as string);
    const variables = JSON.parse(params.variables as string);
    const initialBasicVars = JSON.parse(params.basicVariables as string);
    const cj = JSON.parse(params.cj as string);
    const optType = params.optType as string;
    const infeasibleReason = params.infeasibleReason as string;

    const [simplexTable, setSimplexTable] = useState<number[][]>([]);
    const [basicVariables, setBasicVariables] = useState<string[]>([]);
    const [leavingVar, setLeavingVar] = useState<string | null>(null);
    const [enteringVar, setEnteringVar] = useState<string | null>(null);
    const [iteration, setIteration] = useState<number>(1);
    const [message, setMessage] = useState<string | null>(null);
    const [ratioRow, setRatioRow] = useState<(number | null)[]>([]);
    const [currentSolution, setCurrentSolution] = useState<Map<string, number>>(new Map());
    const [currentZValue, setCurrentZValue] = useState<number>(0);

    const [initialState, setInitialState] = useState<{
        table: number[][];
        basics: string[];
    } | null>(null);

    useEffect(() => {
        if (initialTable && variables && initialBasicVars && cj) {
            initializeDualSimplex();
        }
    }, [initialTable, variables, initialBasicVars, cj]);

    // Update solution display whenever table or basic variables change
    useEffect(() => {
        if (simplexTable.length > 0 && basicVariables.length > 0) {
            updateCurrentSolution();
        }
    }, [simplexTable, basicVariables]);

    const updateCurrentSolution = () => {
        if (!simplexTable || simplexTable.length < 2) return;

        const rhsCol = simplexTable[0].length - 1;
        const solutionMap = new Map<string, number>();
        
        // Initialize all variables to 0
        variables.forEach((varName: string) => solutionMap.set(varName, 0));
        
        // Set basic variable values
        basicVariables.forEach((varName, rowIndex) => {
            const value = simplexTable[rowIndex][rhsCol];
            solutionMap.set(varName, value);
        });

        // Calculate Z value
        const zjRow = simplexTable[simplexTable.length - 2];
        const zValue = zjRow[rhsCol];

        setCurrentSolution(solutionMap);
        setCurrentZValue(zValue);
    };

    const initializeDualSimplex = () => {
        const table = initialTable.map((row: number[]) => [...row]);
        const basics = initialBasicVars.slice();
        
        const computed = computeZjAndZjMinusCj(table, basics);
        
        setSimplexTable(computed.table);
        setBasicVariables(basics);
        setLeavingVar(computed.leavingVar);
        setEnteringVar(computed.enteringVar);
        setRatioRow(computed.ratioRow);
        
        setInitialState({
            table: computed.table.map(r => [...r]),
            basics: basics.slice(),
        });

        if (computed.leavingVar === null) {
            setMessage("No infeasible rows found. Problem is already feasible!");
        }
    };

    const computeZjAndZjMinusCj = (
        table: number[][],
        basicVars: string[]
    ) => {
        const rowsCount = table.length - 2;
        const cols = table[0].length;

        // Calculate CB values
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

        // Calculate Zj - Cj row (for dual simplex)
        const zjMinusCjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            if (j < cj.length) {
                zjMinusCjRow[j] = (zjRow[j] || 0) - (cj[j] || 0);
            } else {
                zjMinusCjRow[j] = 0;
            }
        }

        // Clean up near-zero values
        for (let j = 0; j < cols; j++) {
            if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
            if (Math.abs(zjMinusCjRow[j]) < 1e-10) zjMinusCjRow[j] = 0;
        }

        // Build new table with Zj and Zj-Cj rows
        const newTable = table.slice(0, rowsCount).map((r) => r.slice());
        newTable.push(zjRow);
        newTable.push(zjMinusCjRow);

        // Find leaving variable (most negative RHS)
        const rhsCol = newTable[0].length - 1;
        let mostNegativeRHS = 0;
        let leavingRowIdx = -1;

        for (let i = 0; i < rowsCount; i++) {
            const rhsValue = newTable[i][rhsCol];
            if (rhsValue < mostNegativeRHS - 1e-10) {
                mostNegativeRHS = rhsValue;
                leavingRowIdx = i;
            }
        }

        // Find entering variable using dual simplex ratio test
        const ratioRow: (number | null)[] = Array(cols).fill(null);
        let minRatio = Infinity;
        let enteringColIdx = -1;
        let leavingVarName = null;

        if (leavingRowIdx !== -1) {
            leavingVarName = basicVars[leavingRowIdx];
            const zjMinusCjVars = zjMinusCjRow.slice(0, variables.length);
            const pivotRowCoefficients = newTable[leavingRowIdx];

            for (let j = 0; j < variables.length; j++) {
                const coefficient = pivotRowCoefficients[j];
                
                if (coefficient < -1e-10) {
                    const ratio = Math.abs(zjMinusCjVars[j] / coefficient);
                    ratioRow[j] = ratio;

                    if (ratio < minRatio) {
                        minRatio = ratio;
                        enteringColIdx = j;
                    }
                }
            }
        }
        
        const enteringVarName = enteringColIdx === -1 ? null : variables[enteringColIdx];

        return {
            table: newTable,
            leavingVar: leavingVarName,
            enteringVar: enteringVarName,
            ratioRow: ratioRow,
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
        
        if (message?.includes("already solved") || message?.includes("Optimal")) {
            setMessage("Problem is already solved.");
            return;
        }

        if (!leavingVar || !enteringVar) {
            setMessage("Cannot proceed: No valid pivot element found. Problem may be infeasible.");
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
            setLeavingVar(computed.leavingVar);
            setEnteringVar(computed.enteringVar);
            setRatioRow(computed.ratioRow);
            setIteration((prev) => prev + 1);

            if (computed.leavingVar === null) {
                setMessage("Dual Simplex complete. Optimal solution found.");
                Alert.alert("Solution Found", "Optimal solution reached!");
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
            initialState.table,
            initialState.basics
        );
        setLeavingVar(computed.leavingVar);
        setEnteringVar(computed.enteringVar);
        setRatioRow(computed.ratioRow);
    };

    const handleSolveToOptimal = () => {
        setMessage(null);
        
        if (message?.includes("already solved") || message?.includes("Optimal")) {
            setMessage("Problem is already solved.");
            return;
        }

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

            const computed = computeZjAndZjMinusCj(currentTable, currentBasics);

            if (computed.leavingVar === null) {
                setMessage("Dual Simplex complete. Optimal solution found.");
                setSimplexTable(computed.table);
                setBasicVariables(currentBasics);
                setLeavingVar(null);
                setEnteringVar(null);
                setRatioRow(computed.ratioRow);
                setIteration(currentIteration);
                Alert.alert("Solution Found", "Optimal solution reached!");
                return;
            }

            if (!computed.enteringVar) {
                setMessage("Problem is infeasible - no entering variable found.");
                setSimplexTable(computed.table);
                setBasicVariables(currentBasics);
                setLeavingVar(computed.leavingVar);
                setEnteringVar(null);
                setRatioRow(computed.ratioRow);
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
                
                const nextComputed = computeZjAndZjMinusCj(newTable, newBasics);
                setLeavingVar(nextComputed.leavingVar);
                setEnteringVar(nextComputed.enteringVar);
                setRatioRow(nextComputed.ratioRow);

                setTimeout(() => {
                    solve(newTable, newBasics, currentIteration + 1);
                }, 100);
            } catch (err) {
                setMessage("Error during automatic pivot: " + (err as Error).message);
            }
        };

        solve(simplexTable, basicVariables, iteration);
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
                            const rhsValue = row[row.length - 1];
                            const isNegativeRHS = rhsValue < -1e-10;
                            const isLeavingRow = leavingVar === basicVariables[rowIndex];
                            
                            return (
                                <View key={rowIndex} style={[
                                    styles.row,
                                    isNegativeRHS && styles.infeasibleRow
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
                                                isLeavingRow && styles.pivotRowHighlight,
                                                isPivot && styles.pivotCell
                                            ]}>
                                                <Text style={[
                                                    styles.cellText,
                                                    colIndex === row.length - 1 && isNegativeRHS && styles.negativeValue
                                                ]}>
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
                            {simplexTable[simplexTable.length - 1].map((value, colIndex) => (
                                <View key={colIndex} style={[
                                    styles.cell,
                                    { width: cellWidth },
                                    enteringVar === variables[colIndex] && styles.pivotColHighlight
                                ]}>
                                    <Text style={styles.cellText}>{decimalToFraction(value)}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Ratio Row */}
                        <View style={[styles.row, styles.ratioRow]}>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>Ratio</Text>
                            </View>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                            {ratioRow.map((value, colIndex) => (
                                <View key={colIndex} style={[
                                    styles.cell,
                                    { width: cellWidth },
                                    enteringVar === variables[colIndex] && styles.pivotColHighlight
                                ]}>
                                    <Text style={[
                                        styles.cellText,
                                        enteringVar === variables[colIndex] && value !== null && styles.pivotRatioText
                                    ]}>
                                        {value !== null ? decimalToFraction(value) : "—"}
                                    </Text>
                                </View>
                            ))}
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>🔄 Dual Simplex Method</Text>
                
                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>Why Dual Simplex?</Text>
                    <Text style={styles.infoText}>{infeasibleReason}</Text>
                </View>

                {renderCurrentSolution()}

                <Text style={styles.subHeading}>Iteration {iteration}</Text>
                
                {renderSimplexTable()}

                <View style={styles.equationsContainer}>
                    <Text style={styles.subHeading}>Pivot Information:</Text>
                    <Text style={[styles.equationText, {color: "#FF9800"}]}>
                        Leaving Variable: {leavingVar ?? "None (Feasible!)"}
                    </Text>
                    <Text style={[styles.equationText, {color: "#4CAF50"}]}>
                        Entering Variable: {enteringVar ?? (leavingVar ? "None (Infeasible)" : "None")}
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
                            (message?.includes("already solved") || message?.includes("Optimal") || message?.includes("infeasible")) && 
                            { backgroundColor: "#9E9E9E" }
                        ]}
                        onPress={handleNextIteration}
                        disabled={message?.includes("already solved") || message?.includes("Optimal") || message?.includes("infeasible")}
                    >
                        <Text style={styles.nextButtonText}>Next Iteration</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                        style={[
                            styles.solveButton,
                            (message?.includes("already solved") || message?.includes("Optimal") || message?.includes("infeasible")) && 
                            { backgroundColor: "#9E9E9E" }
                        ]}
                        onPress={handleSolveToOptimal}
                        disabled={message?.includes("already solved") || message?.includes("Optimal") || message?.includes("infeasible")}
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
    infoBox: { backgroundColor: "rgba(255, 152, 0, 0.2)", padding: 15, borderRadius: 10, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: "#FF9800" },
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
    solutionTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 12,
    },
    solutionGrid: {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        padding: 10,
        borderRadius: 8,
    },
    solutionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
    },
    zValueLabel: {
        color: "#FFEB3B",
        fontSize: 20,
        fontWeight: "bold",
        marginRight: 8,
    },
    zValue: {
        color: "#FFEB3B",
        fontSize: 20,
        fontWeight: "bold",
    },
    varLabel: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginRight: 8,
        minWidth: 50,
    },
    varValue: {
        color: "#4CAF50",
        fontSize: 16,
        fontWeight: "bold",
    },
    divider: {
        height: 1,
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        marginVertical: 8,
    },
    equationsContainer: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 15, borderRadius: 8, marginBottom: 20 },
    equationText: { color: "#fff", fontSize: 16, marginBottom: 8, fontWeight: "bold" },
    tableContainer: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, marginBottom: 20, minHeight: 200, overflow: "hidden" },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#fff" },
    infeasibleRow: { backgroundColor: "rgba(255, 152, 0, 0.2)" },
    cjRow: { backgroundColor: "rgba(255, 165, 0, 0.3)" },
    headerRow: { backgroundColor: "rgba(255, 255, 255, 0.2)" },
    zjRow: { backgroundColor: "rgba(0, 255, 0, 0.1)" },
    cjZjRow: { backgroundColor: "rgba(255, 0, 0, 0.1)" },
    ratioRow: { backgroundColor: "rgba(0, 150, 255, 0.15)", borderBottomWidth: 0 },
    cell: { padding: 10, justifyContent: "center", alignItems: "center", borderRightWidth: 1, borderRightColor: "#fff" },
    headerCell: { backgroundColor: "rgba(255, 255, 255, 0.3)" },
    headerText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
    cellText: { color: "#fff", fontSize: 14 },
    negativeValue: { color: "#FFEB3B", fontWeight: "bold" },
    pivotRowHighlight: { backgroundColor: "rgba(255, 152, 0, 0.2)" },
    pivotColHighlight: { backgroundColor: "rgba(76, 175, 80, 0.3)" },
    pivotCell: { backgroundColor: "rgba(255, 255, 0, 0.3)" },
    pivotRatioText: { color: "#66ff66", fontWeight: "bold" },
    buttonContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
    backButton: { backgroundColor: "#fff", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginRight: 8 },
    resetButton: { backgroundColor: "#FFD54F", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginHorizontal: 8 },
    nextButton: { backgroundColor: "#4CAF50", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginLeft: 8 },
    backButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
    resetButtonText: { color: "#3b5998", fontWeight: "bold", fontSize: 14 },
    nextButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
    solveButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 30, alignItems: "center" },
    solveButtonText: { color: "#fff", fontWeight: "bold" },
});