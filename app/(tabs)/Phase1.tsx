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
    const tolerance = 1.0E-10;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
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


type Phase1RouteProp = RouteProp<RootStackParamList, "Phase1">;

export default function Phase1() {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const route = useRoute<Phase1RouteProp>();
    const { objective, constraintsMatrix, rhs, optType, constraintTypes, variableSigns } = route.params;

    // Core Phase 1 state
    const [simplexTable, setSimplexTable] = useState<number[][]>([]);
    const [variables, setVariables] = useState<string[]>([]);
    const [cj, setCj] = useState<number[]>([]);
    const [basicVariables, setBasicVariables] = useState<string[]>([]);
    const [equations, setEquations] = useState<string[]>([]);
    const [enteringVar, setEnteringVar] = useState<string | null>(null);
    const [leavingVar, setLeavingVar] = useState<string | null>(null);
    const [iteration, setIteration] = useState<number>(1);
    const [message, setMessage] = useState<string | null>(null);
    const [phase1Complete, setPhase1Complete] = useState<boolean>(false);

    const [transformedVariableNames, setTransformedVariableNames] = useState<string[]>([]);
    const [originalObjectiveProp, setOriginalObjectiveProp] = useState<number[]>([]);

    const [initialState, setInitialState] = useState<{
        table: number[][];
        vars: string[];
        cj: number[];
        basics: string[];
        iteration: number;
        equations: string[];
    } | null>(null);

    // Transform variables function
    const transformVariables = (
        originalObjective: number[],
        originalConstraints: number[][],
        originalSigns: string[]
    ) => {
        let newObjective: number[] = [];
        let newConstraintsMatrix: number[][] = [];
        let newVariableNames: string[] = [];

        // Initialize the new constraints matrix with empty arrays
        for (let i = 0; i < originalConstraints.length; i++) {
            newConstraintsMatrix.push([]);
        }

        originalSigns.forEach((sign, index) => {
            const varName = `x${index + 1}`;
            const objectiveCoeff = originalObjective[index] || 0;

            if (sign === "≥0") {
                // No change
                newObjective.push(objectiveCoeff);
                newVariableNames.push(varName);
                originalConstraints.forEach((row, rIndex) => {
                    newConstraintsMatrix[rIndex].push(row[index] || 0);
                });
            } else if (sign === "≤0") {
                // Substitute x_i = -x_i'
                const newVarName = `${varName}'`;
                newObjective.push(-objectiveCoeff);
                newVariableNames.push(newVarName);
                originalConstraints.forEach((row, rIndex) => {
                    newConstraintsMatrix[rIndex].push(-(row[index] || 0));
                });
            } else if (sign === "unrestricted") {
                // Substitute x_i = x_i' - x_i''
                const newVarName1 = `${varName}'`;
                const newVarName2 = `${varName}''`;

                // Add x_i'
                newObjective.push(objectiveCoeff);
                newVariableNames.push(newVarName1);
                originalConstraints.forEach((row, rIndex) => {
                    newConstraintsMatrix[rIndex].push(row[index] || 0);
                });

                // Add x_i''
                newObjective.push(-objectiveCoeff);
                newVariableNames.push(newVarName2);
                originalConstraints.forEach((row, rIndex) => {
                    newConstraintsMatrix[rIndex].push(-(row[index] || 0));
                });
            }
        });

        return { newObjective, newConstraintsMatrix, newVariableNames };
    };

    useEffect(() => {
        setOriginalObjectiveProp(objective);
        createInitialPhase1Table();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objective, constraintsMatrix, rhs, optType, constraintTypes, variableSigns]);

    // Format equations function
    const formatEquations = (
        phase1Objective: number[], 
        allVars: string[], 
        transformedConstraints: number[][],
        transformedVarNames: string[]
    ) => {
        // Create Phase 1 objective display
        const objectiveTerms = phase1Objective
            .map((coeff, index) => {
                if (Math.abs(coeff) < 1e-10) return null;
                const sign = coeff >= 0 ? "+" : "-";
                const absCoeff = Math.abs(coeff);
                const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
                return `${sign} ${coeffStr}${allVars[index]}`;
            })
            .filter((t) => t !== null);

        let objectiveStr = (objectiveTerms as string[]).join(" ");
        if (objectiveStr.startsWith("+ ")) objectiveStr = objectiveStr.substring(2);
        if (objectiveStr === "") objectiveStr = "0";

        const formattedObjective = `Minimize W = ${objectiveStr}`;

        // Format constraint equations
        const constraintEquations = transformedConstraints.map((constraint, rowIndex) => {
            const constraintTerms: string[] = [];
            
            // Process only the original variable coefficients
            for (let index = 0; index < constraint.length; index++) {
                if (index >= transformedVarNames.length) {
                    break;
                }
                
                const coeff = constraint[index];
                if (Math.abs(coeff) < 1e-10) continue;
                
                const sign = coeff >= 0 ? "+" : "-";
                const absCoeff = Math.abs(coeff);
                const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
                const varName = transformedVarNames[index];
                constraintTerms.push(`${sign} ${coeffStr}${varName}`);
            }

            let constraintStr = constraintTerms.join(" ");
            if (constraintStr.startsWith("+ ")) constraintStr = constraintStr.substring(2);
            if (constraintStr === "") constraintStr = "0";
            
            return `${constraintStr} ${constraintTypes[rowIndex]} ${decimalToFraction(rhs[rowIndex])}`;
        });

        const allVariableConstraints = allVars.map(varName => `${varName} ≥ 0`);

        setEquations([formattedObjective, ...constraintEquations, ...allVariableConstraints]);
    };

    const createInitialPhase1Table = () => {
        // Perform variable transformations FIRST
        const signs = variableSigns || Array(objective.length).fill("≥0");

        const { 
            newObjective,
            newConstraintsMatrix: transformedConstraints, 
            newVariableNames 
        } = transformVariables(objective, constraintsMatrix, signs);
        
        const numTransformedVars = newVariableNames.length; 
        const numConstraints = transformedConstraints.length;

        // Count slack, surplus, and artificial variables needed
        let slackCount = 0;
        let surplusCount = 0;
        let artificialCount = 0;

        constraintTypes.forEach(type => {
            if (type === "≤") slackCount++;
            if (type === "≥") { surplusCount++; artificialCount++; }
            if (type === "=") artificialCount++;
        });

        // Create variable names
        const originalVars = newVariableNames; 
        const slackVars = Array.from({ length: slackCount }, (_, i) => `s${i + 1}`);
        const surplusVars = Array.from({ length: surplusCount }, (_, i) => `e${i + 1}`);
        const artificialVars = Array.from({ length: artificialCount }, (_, i) => `a${i + 1}`);
        const allVars = [...originalVars, ...slackVars, ...surplusVars, ...artificialVars];
        setVariables(allVars);

        // Create Phase 1 objective: minimize sum of artificial variables
        const phase1Objective = [
            ...Array(numTransformedVars).fill(0),
            ...Array(slackCount + surplusCount).fill(0),  
            ...Array(artificialCount).fill(1)   
        ];
        setCj(phase1Objective);

        // Create Phase 1 constraints matrix
        const newConstraintsMatrix: number[][] = [];
        const newBasicVariables: string[] = [];
        let slackIndex = 0;
        let surplusIndex = 0;
        let artificialIndex = 0;

        for (let i = 0; i < numConstraints; i++) {
            const row = [...transformedConstraints[i]];

            // Add slack variables columns
            for (let j = 0; j < slackCount; j++) {
                if (constraintTypes[i] === "≤" && j === slackIndex) {
                    row.push(1);
                } else {
                    row.push(0);
                }
            }

            // Add surplus variables columns  
            for (let j = 0; j < surplusCount; j++) {
                if (constraintTypes[i] === "≥" && j === surplusIndex) {
                    row.push(-1);
                } else {
                    row.push(0);
                }
            }

            // Add artificial variables columns
            for (let j = 0; j < artificialCount; j++) {
                if ((constraintTypes[i] === "≥" || constraintTypes[i] === "=") && j === artificialIndex) {
                    row.push(1);
                } else {
                    row.push(0);
                }
            }

            // Set basic variables
            if (constraintTypes[i] === "≤") {
                newBasicVariables.push(`s${slackIndex + 1}`);
                slackIndex++;
            } else if (constraintTypes[i] === "≥") {
                newBasicVariables.push(`a${artificialIndex + 1}`);
                surplusIndex++;
                artificialIndex++;
            } else if (constraintTypes[i] === "=") {
                newBasicVariables.push(`a${artificialIndex + 1}`);
                artificialIndex++;
            }

            newConstraintsMatrix.push(row);
        }

        setBasicVariables(newBasicVariables);

        // Create initial simplex table
        const newSimplexTable: number[][] = [];
        for (let i = 0; i < numConstraints; i++) {
            newSimplexTable.push([...newConstraintsMatrix[i], rhs[i]]);
        }

        // Add placeholder Zj and Cj-Zj rows
        const cols = allVars.length + 1;
        const zjRow = Array(cols).fill(0);
        const cjZjRow = Array(cols).fill(0);
        newSimplexTable.push(zjRow);
        newSimplexTable.push(cjZjRow);

        setSimplexTable(newSimplexTable);
        setIteration(1);
        setMessage(null);
        setPhase1Complete(false);

        // Store the transformed variable names
        setTransformedVariableNames(newVariableNames);

        // Format equations - pass newVariableNames directly
        formatEquations(phase1Objective, allVars, transformedConstraints, newVariableNames);

        // Compute initial Zj and Cj-Zj for Phase 1
        const computed = computeZjAndCjMinusZj(newSimplexTable, newBasicVariables, phase1Objective, allVars);
        setSimplexTable(computed.table);
        setEnteringVar(computed.enteringVar ?? null);
        setLeavingVar(computed.leavingVar ?? null);

        // Store initial state for reset
        setInitialState({
            table: computed.table.map((r) => [...r]),
            vars: allVars.slice(),
            cj: phase1Objective.slice(),
            basics: newBasicVariables.slice(),
            iteration: 1,
            equations: equations.slice(),
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

    // FIX 1: Changed to Zj - Cj (correct for Phase 1 minimization)
    const zjMinusCjRow = Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
        if (j < cjRow.length) {
            zjMinusCjRow[j] = zjRow[j] - cjRow[j];  // WAS: cjRow[j] - zjRow[j]
        } else {
            zjMinusCjRow[j] = zjRow[j];
        }
    }

    // Clean up very small numbers
    for (let j = 0; j < cols; j++) {
        if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
        if (Math.abs(zjMinusCjRow[j]) < 1e-10) zjMinusCjRow[j] = 0;
    }

    const newTable = table.slice(0, rowsCount).map((r) => r.slice());
    newTable.push(zjRow);
    newTable.push(zjMinusCjRow);

    // FIX 2: For Phase 1 minimization, choose MOST POSITIVE Zj-Cj
    const zjMinusCjVars = zjMinusCjRow.slice(0, allVars.length);
    const maxVal = Math.max(...zjMinusCjVars);
    
    // FIX 3: Optimal when all Zj-Cj <= 0
    if (maxVal <= 1e-10) {
        return { table: newTable, enteringVar: null as string | null, leavingVar: null as string | null };
    }
    
    const enteringIndex = zjMinusCjVars.indexOf(maxVal);
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
    return { table: newTable, enteringVar: enteringVarName, leavingVar: leavingVarName };
};

    const performPivot = (currentTable: number[][], pivotRowIdx: number, pivotColIdx: number) => {
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

   
       const handleNextIteration = () => {
    setMessage(null);
    if (!simplexTable || simplexTable.length < 2) return;

    const rowsCount = simplexTable.length - 2;
    const cols = simplexTable[0].length;
    const zjMinusCjRow = simplexTable[simplexTable.length - 1];
    const zjMinusCjVars = zjMinusCjRow.slice(0, variables.length);

    // FIX: For minimization, optimal when all Zj-Cj <= 0
    const maxVal = Math.max(...zjMinusCjVars);
    if (maxVal <= 1e-10) {
        setEnteringVar(null);
        setLeavingVar(null);
        const objectiveValue = simplexTable[simplexTable.length - 2][cols - 1];
        if (Math.abs(objectiveValue) < 1e-10) {
            setMessage("Phase 1 complete. Feasible solution found. Ready for Phase 2.");
            setPhase1Complete(true);
        } else {
            setMessage("Phase 1 complete. Original problem is infeasible.");
        }
        return;
    }

    // FIX: Choose most positive Zj-Cj
    const enteringIndex = zjMinusCjVars.indexOf(maxVal);

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
            setLeavingVar(null);
            setMessage("Phase 1 problem is unbounded.");
            return;
        }

        try {
            const newTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
            const newBasics = basicVariables.slice();
            newBasics[leavingRowIdx] = variables[enteringIndex];

            const computed = computeZjAndCjMinusZj(newTable, newBasics, cj, variables);

            setSimplexTable(computed.table);
            setBasicVariables(newBasics);
            setEnteringVar(computed.enteringVar ?? variables[enteringIndex]);
            setLeavingVar(computed.leavingVar ?? basicVariables[leavingRowIdx]);
            setIteration((prev) => prev + 1);

            const cjZjNow = computed.table[computed.table.length - 1].slice(0, variables.length);
            const minNow = Math.min(...cjZjNow);
            if (minNow >= -1e-10) {
                const objectiveValue = computed.table[computed.table.length - 2][computed.table[0].length - 1];
                if (Math.abs(objectiveValue) < 1e-10) {
                    setMessage("Phase 1 complete. Feasible solution found. Ready for Phase 2.");
                    setPhase1Complete(true);
                } else {
                    setMessage("Phase 1 complete. Original problem is infeasible.");
                }
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
        setPhase1Complete(false);

        const computed = computeZjAndCjMinusZj(initialState.table, initialState.basics, initialState.cj, initialState.vars);
        setSimplexTable(computed.table);
        setEnteringVar(computed.enteringVar ?? null);
        setLeavingVar(computed.leavingVar ?? null);
    };

    const handleSolveToOptimal = () => {
        setMessage(null);

        const solve = (currentTable: number[][], currentBasics: string[], currentIteration: number): void => {
            const maxIterations = 100;

            if (currentIteration > maxIterations) {
                setMessage("Stopped: reached maximum automatic iterations limit.");
                return;
            }

            const lastRow = currentTable[currentTable.length - 1] ?? [];
            const cjZjVars = lastRow.slice(0, variables.length);
            const minVal = cjZjVars.length ? Math.min(...cjZjVars) : Infinity;

            if (minVal >= -1e-10) {
                const objectiveValue = currentTable[currentTable.length - 2][currentTable[0].length - 1];
                if (Math.abs(objectiveValue) < 1e-10) {
                    setMessage("Phase 1 complete. Feasible solution found. Ready for Phase 2.");
                    setPhase1Complete(true);
                } else {
                    setMessage("Phase 1 complete. Original problem is infeasible.");
                }
                setEnteringVar(null);
                setLeavingVar(null);
                return;
            }

            const enteringIndex = cjZjVars.indexOf(minVal);

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
                setMessage("Phase 1 problem is unbounded.");
                setEnteringVar(variables[enteringIndex]);
                setLeavingVar(null);
                return;
            }

            try {
                const newTable = performPivot(currentTable, leavingRowIdx, enteringIndex);
                const newBasics = currentBasics.slice();
                newBasics[leavingRowIdx] = variables[enteringIndex];
                const computed = computeZjAndCjMinusZj(newTable, newBasics, cj, variables);

                setSimplexTable(computed.table);
                setBasicVariables(newBasics);
                setIteration(currentIteration + 1);

                setTimeout(() => {
                    solve(computed.table, newBasics, currentIteration + 1);
                }, 100);

            } catch (err) {
                setMessage("Error during automatic pivot: " + (err as Error).message);
            }
        };

        solve(simplexTable, basicVariables, iteration);
    };

    const handleProceedToPhase2 = () => {
        if (!phase1Complete) return;

        navigation.navigate("Phase2", {
            originalObjective: originalObjectiveProp,
            phase1Table: simplexTable, 
            phase1Variables: variables, 
            phase1BasicVariables: basicVariables, 
            optType: optType,
            variableSigns: variableSigns,
            transformedVariableNames: transformedVariableNames
        });
    };

    const handleGoBack = () => {
        navigation.goBack();
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
                            <View style={[styles.cell, styles.headerCell,{ width: cellWidth }]}>
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
                                    {(() => {
                                        const idx = variables.indexOf(basicVariables[rowIndex]);
                                        return <Text style={styles.cellText}>{idx === -1 ? "0" : decimalToFraction(cj[idx])}</Text>;
                                    })()}
                                </View>
                                {row.map((value, colIndex) => (
                                    <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
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
        <Text style={styles.cellText}>Zj - Cj</Text>  {/* Changed from Cj - Zj */}
    </View>
    <View style={[styles.cell, { width: cellWidth }]}>
        <Text style={styles.cellText}></Text>
    </View>
    {simplexTable[simplexTable.length - 1].map((value, colIndex) => (
        <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
            <Text style={[styles.cellText, value > 1e-10 && styles.positiveValue]}>
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



    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>Two-Phase Method: Phase I</Text>

                <View style={styles.equationsContainer}>
                    <Text style={styles.subHeading}>Phase I Problem:</Text>
                    {equations.map((equation, index) => (
                        <Text key={index} style={styles.equationText}>
                            {equation}
                        </Text>
                    ))}
                </View>

                <Text style={styles.subHeading}>Phase I Table (Iteration {iteration})</Text>

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
                        style={[styles.nextButton, phase1Complete && { backgroundColor: "#9E9E9E" }]}
                        onPress={handleNextIteration}
                        disabled={phase1Complete}
                    >
                        <Text style={styles.nextButtonText}>Next Iteration</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                    <TouchableOpacity style={styles.solveButton} onPress={handleSolveToOptimal}>
                        <Text style={styles.solveButtonText}>Solve to Optimal</Text>
                    </TouchableOpacity>

                    {phase1Complete && (
                        <TouchableOpacity style={styles.phase2Button} onPress={handleProceedToPhase2}>
                            <Text style={styles.phase2ButtonText}>Proceed to Phase II</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#3b5998", paddingTop: 40 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    heading: { color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
    subHeading: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 10, marginTop: 15, textAlign: "center" },
    equationsContainer: { backgroundColor: "rgba(255, 255, 255, 0.1)", padding: 15, borderRadius: 8, marginBottom: 20 },
    equationText: { color: "#fff", fontSize: 16, marginBottom: 8, fontStyle: "italic" },
    tableContainer: { borderWidth: 1, borderColor: "#fff", borderRadius: 8, marginBottom: 20, minHeight: 200 },
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
    solveButton: { backgroundColor: "#2196F3", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginRight: 8 },
    solveButtonText: { color: "#fff", fontWeight: "bold" },
    phase2Button: { backgroundColor: "#FF9800", padding: 12, borderRadius: 30, alignItems: "center", flex: 1, marginLeft: 8 },
    phase2ButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
    positiveValue: { color: "#ff6666", fontWeight: "bold" },
});