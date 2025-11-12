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

// --- (decimalToFraction function remains unchanged) ---
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

    const tolerance = 1.0e-10;
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
        originalRHS: number[]; 

    };
    RHSChange: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
        constraintsMatrix: number[][];
        originalRHS: number[];
        bInverse: number[][]; // ← ADD THIS LINE
    };
};

type Phase2RouteProp = RouteProp<RootStackParamList, "Phase2">;

export default function Phase2() {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const route = useRoute<Phase2RouteProp>();
    const {
        originalObjective,
        phase1Table,
        phase1Variables,
        phase1BasicVariables,
        optType,
        variableSigns,
        transformedVariableNames,
        originalRHS 
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

    const [initialState, setInitialState] = useState<{
        table: number[][];
        vars: string[];
        cj: number[];
        basics: string[];
        iteration: number;
        equations: string[];
    } | null>(null);

    useEffect(() => {
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
    ]);

    // *** MODIFICATION: Simplified formatEquations logic ***
    const formatEquations = (
        phase2Objective: number[],
        allVars: string[]
    ): string[] => {
        const objectiveTerms = phase2Objective
            .map((coeff, index) => {
                if (Math.abs(coeff) < 1e-10) return null;
                // *** FIX: Display coefficient directly. It's no longer inverted. ***
                const displayCoeff = coeff;
                const sign = displayCoeff >= 0 ? "+" : "-";
                const absCoeff = Math.abs(displayCoeff);
                const coeffStr = absCoeff === 1 ? "" : decimalToFraction(absCoeff);
                return `${sign} ${coeffStr}${allVars[index]}`;
            })
            .filter((t) => t !== null);

        let objectiveStr = (objectiveTerms as string[]).join(" ");
        if (objectiveStr.startsWith("+ ")) objectiveStr = objectiveStr.substring(2);
        if (objectiveStr === "") objectiveStr = "0";

        // *** FIX: This now correctly displays "Minimize" or "Maximize" based on optType ***
        const formattedObjective = `${optType === "Maximize" ? "Maximize" : "Minimize"
            } Z = ${objectiveStr}`;

        const constraintInfo =
            "Subject to: Constraints from Phase I (artificial variables removed)";
        const nonNegativityConstraints = allVars.map(
            (varName) => `${varName} \u2265 0`
        );

        const newEquations = [
            formattedObjective,
            constraintInfo,
            ...nonNegativityConstraints,
        ];

        setEquations(newEquations);
        return newEquations;
    };

    const displayFinalSolution = (
        finalTable: number[][],
        finalBasics: string[],
        allVars: string[]
    ) => {
        const solutionMap = new Map<string, number>();
        const rhsCol = finalTable[0].length - 1;

        allVars.forEach((varName) => solutionMap.set(varName, 0));

        finalBasics.forEach((varName, rowIndex) => {
            const value = finalTable[rowIndex][rhsCol];
            solutionMap.set(varName, value);
        });

        const originalSolution = new Map<string, number>();
        const numOriginalVars = variableSigns.length;

        for (let i = 0; i < numOriginalVars; i++) {
            const varName = `x${i + 1}`;
            const sign = variableSigns[i];
            let value = 0;

            if (sign === "≥0") {
                value = solutionMap.get(varName) || 0;
            } else if (sign === "≤0") {
                const primeVar = `${varName}'`;
                value = -(solutionMap.get(primeVar) || 0);
            } else if (sign === "unrestricted") {
                const primeVar = `${varName}'`;
                const doublePrimeVar = `${varName}''`;
                value =
                    (solutionMap.get(primeVar) || 0) -
                    (solutionMap.get(doublePrimeVar) || 0);
            }
            originalSolution.set(varName, value);
        }

        const zjRow = finalTable[finalTable.length - 2];
        let zValue = zjRow[rhsCol];

        // *** FIX: Removed inversion. Z-value is now calculated directly. ***
        // if (optType === "Minimize") {
        //   zValue = -zValue;
        // }

        const solutionParts: string[] = [];
        originalSolution.forEach((value, varName) => {
            solutionParts.push(`${varName} = ${decimalToFraction(value)}`);
        });
        const solutionString = solutionParts.join(", ");

        const finalMessage = `Optimal Solution Found:\nZ = ${decimalToFraction(
            zValue
        )}\nAt: ${solutionString}`;

        Alert.alert("Solution Found", finalMessage);
        setMessage(finalMessage);
    };


    // *** MODIFICATION: createPhase2Table now passes original coefficients ***
    const createPhase2Table = () => {
        if (
            !phase1Variables || !Array.isArray(phase1Variables) ||
            !phase1Table || !Array.isArray(phase1Table) ||
            !originalObjective || !Array.isArray(originalObjective) ||
            !phase1BasicVariables || !Array.isArray(phase1BasicVariables) ||
            !variableSigns || !Array.isArray(variableSigns) ||
            !transformedVariableNames || !Array.isArray(transformedVariableNames)
        ) {
            console.error("Missing or invalid parameters for Phase 2.");
            setMessage("Error: Failed to load Phase 2 data.");
            return;
        }

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
                // *** FIX: DO NOT invert coefficients here. ***
                // We will handle Min/Max logic in the compute function.
                phase2Objective.push(coeff);
            } else {
                phase2Objective.push(0);
            }
        }

        setCj(phase2Objective);

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

        const newBasicVariables = phase1BasicVariables.filter(
            (varName) => !varName.startsWith("a")
        );

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

        const cols = filteredVariables.length + 1;
        const zjRow = Array(cols).fill(0);
        const zjCjRow = Array(cols).fill(0);
        phase2Table.push(zjRow);
        phase2Table.push(zjCjRow);

        setSimplexTable(phase2Table);
        setIteration(1);
        setMessage(null);

        const newEquations = formatEquations(phase2Objective, filteredVariables);

        const computed = computeZjAndZjMinusCj(
            phase2Table,
            finalBasicVariables,
            phase2Objective,
            filteredVariables
        );
        setSimplexTable(computed.table);
        setEnteringVar(computed.enteringVar ?? null);
        setLeavingVar(computed.leavingVar ?? null);

        if (computed.enteringVar === null) {
            // This means the initial table was already optimal
            setMessage("Phase 2 complete. Optimal solution found.");
            displayFinalSolution(
                computed.table,
                finalBasicVariables,
                filteredVariables
            );
        }

        setInitialState({
            table: computed.table.map((r) => [...r]),
            vars: filteredVariables.slice(),
            cj: phase2Objective.slice(),
            basics: finalBasicVariables.slice(),
            iteration: 1,
            equations: newEquations.slice(),
        });
    };

    // *** MODIFICATION: This function now handles BOTH Min and Max logic ***
    const computeZjAndZjMinusCj = (
        table: number[][],
        basicVars: string[],
        cjRow: number[],
        allVars: string[]
    ) => {
        if (table.length < 2 || basicVars.length === 0 || table[0].length === 0) {
            return { table, enteringVar: null, leavingVar: null };
        }

        const rowsCount = table.length - 2;
        const cols = table[0].length;

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

        // Cj - Zj for Phase 2
        const cjMinusZjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            if (j < cjRow.length) {
                cjMinusZjRow[j] = (cjRow[j] || 0) - (zjRow[j] || 0);
            } else {
                cjMinusZjRow[j] = 0;
            }
        }

        for (let j = 0; j < cols; j++) {
            if (Math.abs(zjRow[j]) < 1e-10) zjRow[j] = 0;
            if (Math.abs(cjMinusZjRow[j]) < 1e-10) cjMinusZjRow[j] = 0;
        }

        const newTable = table.slice(0, rowsCount).map((r) => r.slice());
        newTable.push(zjRow);
        newTable.push(cjMinusZjRow);

        const cjMinusZjVars = cjMinusZjRow.slice(0, allVars.length);
        if (cjMinusZjVars.length === 0) {
            return { table: newTable, enteringVar: null, leavingVar: null };
        }

        let enteringIndex = -1;

        if (optType === "Maximize") {
            // Maximization: Enter on most POSITIVE Cj-Zj
            const maxVal = Math.max(...cjMinusZjVars);
            if (maxVal <= 1e-10) {
                return { table: newTable, enteringVar: null, leavingVar: null };
            }
            enteringIndex = cjMinusZjVars.indexOf(maxVal);
        } else {
            // Minimization: Enter on most NEGATIVE Cj-Zj
            const minVal = Math.min(...cjMinusZjVars);
            if (minVal >= -1e-10) {
                return { table: newTable, enteringVar: null, leavingVar: null };
            }
            enteringIndex = cjMinusZjVars.indexOf(minVal);
        }

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
        return {
            table: newTable,
            enteringVar: enteringVarName,
            leavingVar: leavingVarName,
        };
    };

    // --- (performPivot function remains unchanged) ---
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

    // *** MODIFICATION: Updated handleNextIteration with dual logic ***
    const handleNextIteration = () => {
        if (!simplexTable || simplexTable.length < 2) return;

        const rowsCount = simplexTable.length - 2;
        const cols = simplexTable[0].length;
        const cjMinusZjRow = simplexTable[simplexTable.length - 1];
        const cjMinusZjVars = cjMinusZjRow.slice(0, variables.length);

        if (cjMinusZjVars.length === 0) {
            setMessage("Phase 2 complete. Optimal solution found.");
            displayFinalSolution(simplexTable, basicVariables, variables);
            setEnteringVar(null);
            setLeavingVar(null);
            return;
        }

        // Check optimality based on problem type
        let isOptimal = false;
        if (optType === "Maximize") {
            const maxVal = Math.max(...cjMinusZjVars);
            if (maxVal <= 1e-10) isOptimal = true;
        } else {
            const minVal = Math.min(...cjMinusZjVars);
            if (minVal >= -1e-10) isOptimal = true;
        }

        if (isOptimal) {
            setMessage("Phase 2 complete. Optimal solution found.");
            displayFinalSolution(simplexTable, basicVariables, variables);
            setEnteringVar(null);
            setLeavingVar(null);
            return;
        }

        setMessage(null);

        // Find entering variable
        let enteringIndex: number;
        if (optType === "Maximize") {
            const maxVal = Math.max(...cjMinusZjVars);
            enteringIndex = cjMinusZjVars.indexOf(maxVal);
        } else {
            const minVal = Math.min(...cjMinusZjVars);
            enteringIndex = cjMinusZjVars.indexOf(minVal);
        }

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
            setMessage("Phase 2 problem is unbounded.");
            return;
        }

        try {
            const newTable = performPivot(simplexTable, leavingRowIdx, enteringIndex);
            const newBasics = basicVariables.slice();
            newBasics[leavingRowIdx] = variables[enteringIndex];

            const computed = computeZjAndZjMinusCj(
                newTable,
                newBasics,
                cj,
                variables
            );

            setSimplexTable(computed.table);
            setBasicVariables(newBasics);
            // *** FIX: Set entering/leaving from computed result ***
            setEnteringVar(computed.enteringVar ?? null);
            setLeavingVar(computed.leavingVar ?? null);
            setIteration((prev) => prev + 1);

            // Check if the *newly computed* table is optimal
            if (computed.enteringVar === null) {
                setMessage("Phase 2 complete. Optimal solution found.");
                displayFinalSolution(computed.table, newBasics, variables);
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
        setIteration(initialState.iteration);
        setEquations(initialState.equations.slice());
        setMessage(null);

        const computed = computeZjAndZjMinusCj(
            initialState.table,
            initialState.basics,
            initialState.cj,
            initialState.vars
        );
        setEnteringVar(computed.enteringVar ?? null);
        setLeavingVar(computed.leavingVar ?? null);
    };

    // *** MODIFICATION: Updated handleSolveToOptimal with dual logic ***
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

            const lastRow = currentTable[currentTable.length - 1] ?? [];
            const cjMinusZjVars = lastRow.slice(0, variables.length);  // FIXED: correct name

            let isOptimal = false;
            let enteringIndex = -1;

            if (optType === "Maximize") {
                // FIXED: For Maximize, find MAXIMUM Cj-Zj
                const maxVal = cjMinusZjVars.length ? Math.max(...cjMinusZjVars) : -Infinity;
                if (maxVal <= 1e-10) {
                    isOptimal = true;
                } else {
                    enteringIndex = cjMinusZjVars.indexOf(maxVal);
                }
            } else { // Minimize
                // FIXED: For Minimize, find MINIMUM Cj-Zj
                const minVal = cjMinusZjVars.length ? Math.min(...cjMinusZjVars) : Infinity;
                if (minVal >= -1e-10) {
                    isOptimal = true;
                } else {
                    enteringIndex = cjMinusZjVars.indexOf(minVal);
                }
            }

            if (isOptimal) {
                setMessage("Phase 2 complete. Optimal solution found.");
                displayFinalSolution(currentTable, currentBasics, variables);
                setEnteringVar(null);
                setLeavingVar(null);
                return;
            }

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
                const computed = computeZjAndZjMinusCj(
                    newTable,
                    newBasics,
                    cj,
                    variables
                );

                setSimplexTable(computed.table);
                setBasicVariables(newBasics);
                setIteration(currentIteration + 1);

                setTimeout(() => {
                    solve(computed.table, newBasics, currentIteration + 1);
                }, 50);
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

        if (!message?.includes("complete") && !message?.includes("Optimal")) {
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
    // Calculate B-inverse
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

    // Extract current constraints matrix (WITHOUT the RHS and Zj/Cj-Zj rows)
    const currentConstraints = simplexTable.slice(0, -2).map(row => 
        row.slice(0, -1) // Remove RHS column
    );

    navigation.navigate("SensitivityAnalysis", {
        finalTable: simplexTable.map(row => [...row]),
        variables: variables.slice(),
        basicVariables: basicVariables.slice(),
        cj: cj.slice(),
        optType: optType,
        originalObjective: originalObjective.slice(),
        variableSigns: variableSigns.slice(),
        constraintsMatrix: currentConstraints,
        originalRHS: originalRHS.slice(), // ← FIXED: Use the ORIGINAL RHS passed from Phase1
    });
};
    // *** MODIFICATION: Updated renderSimplexTable with dual highlighting ***
    const renderSimplexTable = () => {
        if (simplexTable.length === 0) return null;
        if (!Array.isArray(simplexTable) || simplexTable.length < 2) return null;

        const numVars = variables.length;
        const screenWidth = Dimensions.get("window").width;
        const cellWidth = Math.max(70, screenWidth / (numVars + 3));

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
                            {cj.map((value, index) => (
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
                                    <Text style={styles.cellText}>{basicVariables[rowIndex] || ""}</Text>
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
                                    <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                                        <Text style={styles.cellText}>
                                            {value !== undefined ? decimalToFraction(value) : "0"}
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
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                            {simplexTable[simplexTable.length - 2]?.map((value, colIndex) => (
                                <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                                    <Text style={styles.cellText}>
                                        {value !== undefined ? decimalToFraction(value) : "0"}
                                    </Text>
                                </View>
                            )) || null}
                        </View>

                        {/* Cj - Zj Row */}
                        <View style={[styles.row, styles.zjCjRow]}>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>Cj - Zj</Text>
                            </View>
                            <View style={[styles.cell, { width: cellWidth }]}>
                                <Text style={styles.cellText}>{" "}</Text>
                            </View>
                            {simplexTable[simplexTable.length - 1]?.map((value, colIndex) => {
                                let textStyle = styles.cellText;
                                // Highlight based on problem type
                                if (value !== undefined) {
                                    if (optType === "Maximize" && value > 1e-10) {
                                        textStyle = { ...textStyle, ...styles.positiveValue };
                                    } else if (optType === "Minimize" && value < -1e-10) {
                                        textStyle = { ...textStyle, ...styles.negativeValue };
                                    }
                                }

                                return (
                                    <View key={colIndex} style={[styles.cell, { width: cellWidth }]}>
                                        <Text style={textStyle}>
                                            {value !== undefined ? decimalToFraction(value) : "0"}
                                        </Text>
                                    </View>
                                );
                            }) || null}
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
                                { fontStyle: "normal", color: "#66ff66" },
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
                <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                        style={[
                            styles.sensitivityButton,
                            !message?.includes("complete") && { opacity: 0.6 }
                        ]}
                        onPress={handleSensitivityAnalysis}
                    >
                        <Text style={styles.sensitivityButtonText}>📊 Sensitivity Analysis</Text>
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
    zjCjRow: { backgroundColor: "rgba(255, 0, 0, 0.1)" },
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
    // *** FIX: Added positiveValue style for minimization ***
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
    sensitivityButton: {
        backgroundColor: "#9C27B0",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 10,
    },
    sensitivityButtonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },

});