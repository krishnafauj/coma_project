import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
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

export default function ObjectiveChange() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const finalTable = JSON.parse(params.finalTable as string);
    const variables = JSON.parse(params.variables as string);
    const basicVariables = JSON.parse(params.basicVariables as string);
    const originalCj = JSON.parse(params.cj as string);
    const optType = params.optType as string;
    const originalObjective = JSON.parse(params.originalObjective as string);
    const variableSigns = JSON.parse(params.variableSigns as string);

    const [newCj, setNewCj] = useState<string[]>(
        originalCj.map((val: number) => String(val))
    );
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [changeType, setChangeType] = useState<"basic" | "non-basic" | null>(null);
    const [affectedVariable, setAffectedVariable] = useState<string | null>(null);

    const parseInputString = (input: string): number => {
        const trimmedInput = input.trim();

        if (trimmedInput.includes('/')) {
            const parts = trimmedInput.split('/');
            if (parts.length !== 2) return NaN;
            const numerator = parseFloat(parts[0]);
            const denominator = parseFloat(parts[1]);
            if (denominator === 0 || isNaN(numerator) || isNaN(denominator)) {
                return NaN;
            }
            return numerator / denominator;
        }
        return parseFloat(trimmedInput);
    };

    const handleCjChange = (text: string, index: number) => {
        const updatedCj = [...newCj];
        updatedCj[index] = text;
        setNewCj(updatedCj);
    };

    const analyzeCostChange = () => {
        // Parse new Cj values
        const c_hat_vector: number[] = [];
        for (const val of newCj) {
            const numVal = parseInputString(val);
            if (isNaN(numVal)) {
                Alert.alert("Error", `Invalid input: "${val}". Please enter a valid number.`);
                return;
            }
            c_hat_vector.push(numVal);
        }

        // Find which coefficients changed
        const changedIndices: number[] = [];
        for (let i = 0; i < originalCj.length; i++) {
            if (Math.abs(originalCj[i] - c_hat_vector[i]) > 1e-9) {
                changedIndices.push(i);
            }
        }

        if (changedIndices.length === 0) {
            Alert.alert("No Change", "The cost vector is identical to the original.");
            return;
        }

        // Determine if changed variables are basic or non-basic
        let hasBasicChange = false;
        let hasNonBasicChange = false;
        let changedVarNames: string[] = [];

        for (const idx of changedIndices) {
            const varName = variables[idx];
            changedVarNames.push(varName);
            if (basicVariables.includes(varName)) {
                hasBasicChange = true;
            } else {
                hasNonBasicChange = true;
            }
        }

        setAffectedVariable(changedVarNames.join(", "));

        // Recalculate Zj and Zj - Cj with new cost vector
        const rowsCount = finalTable.length - 2;
        const cols = finalTable[0].length;

        // Calculate CB with new costs
        const cb: number[] = basicVariables.map((b: string) => {
            const idx = variables.indexOf(b);
            return idx === -1 ? 0 : (c_hat_vector[idx] ?? 0);
        });

        // Calculate new Zj row
        const zjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            let sum = 0;
            for (let i = 0; i < rowsCount; i++) {
                sum += (cb[i] || 0) * (finalTable[i][j] || 0);
            }
            zjRow[j] = sum;
        }

        // Calculate new Cj - Zj row
        const cjMinusZjRow = Array(cols).fill(0);
        for (let j = 0; j < cols; j++) {
            if (j < c_hat_vector.length) {
                cjMinusZjRow[j] = (c_hat_vector[j] || 0) - (zjRow[j] || 0);
            } else {
                cjMinusZjRow[j] = 0;
            }
        }

        // Check optimality based on problem type
        const cjMinusZjVars = cjMinusZjRow.slice(0, variables.length);
        let isStillOptimal = false;

        if (optType === "Maximize") {
            const maxVal = Math.max(...cjMinusZjVars);
            isStillOptimal = maxVal <= 1e-10;
        } else {
            const minVal = Math.min(...cjMinusZjVars);
            isStillOptimal = minVal >= -1e-10;
        }

        // Calculate new Z value
        const newZValue = zjRow[zjRow.length - 1];

        // Determine case and set results
        if (hasBasicChange && hasNonBasicChange) {
            setChangeType("basic");
            if (isStillOptimal) {
                setAnalysisResult(
                    `✅ CASE II: Basic Variable Cost Changed (Mixed)\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `Both basic and non-basic variables changed.\n` +
                    `New Z value: ${decimalToFraction(newZValue)}\n\n` +
                    `The basis remains optimal! Only Z value changed.\n` +
                    `All new (Cj - Zj) values satisfy optimality conditions.`
                );
            } else {
                setAnalysisResult(
                    `⚠️ CASE II: Basic Variable Cost Changed (Mixed)\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `The current basis is NO LONGER OPTIMAL.\n` +
                    `New Z value: ${decimalToFraction(newZValue)}\n\n` +
                    `Some (Cj - Zj) values violate optimality.\n` +
                    `Continue with Simplex iterations to find new optimum.`
                );
            }
        } else if (hasBasicChange) {
            setChangeType("basic");
            if (isStillOptimal) {
                setAnalysisResult(
                    `✅ CASE II: Basic Variable Cost Changed\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `These are BASIC variables.\n` +
                    `New Z value: ${decimalToFraction(newZValue)}\n\n` +
                    `The basis remains optimal! Only Z value changed.\n` +
                    `All new (Cj - Zj) values satisfy optimality conditions.`
                );
            } else {
                setAnalysisResult(
                    `⚠️ CASE II: Basic Variable Cost Changed\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `These are BASIC variables.\n` +
                    `The current basis is NO LONGER OPTIMAL.\n` +
                    `New Z value: ${decimalToFraction(newZValue)}\n\n` +
                    `Some (Cj - Zj) values violate optimality.\n` +
                    `Continue with Simplex iterations to find new optimum.`
                );
            }
        } else {
            setChangeType("non-basic");
            if (isStillOptimal) {
                setAnalysisResult(
                    `✅ CASE I: Non-Basic Variable Cost Changed\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `These are NON-BASIC variables.\n` +
                    `Z value UNCHANGED: ${decimalToFraction(newZValue)}\n\n` +
                    `The basis remains optimal!\n` +
                    `(Cj - Zj) values updated but still satisfy optimality.`
                );
            } else {
                setAnalysisResult(
                    `⚠️ CASE I: Non-Basic Variable Cost Changed\n\n` +
                    `Changed variables: ${changedVarNames.join(", ")}\n\n` +
                    `These are NON-BASIC variables.\n` +
                    `Z value UNCHANGED: ${decimalToFraction(newZValue)}\n\n` +
                    `The current basis is NO LONGER OPTIMAL.\n` +
                    `New (Cj - Zj) values violate optimality conditions.\n` +
                    `Continue with Simplex iterations to find new optimum.`
                );
            }
        }
    };

    const proceedToSimplex = () => {
        const c_hat_vector: number[] = [];
        for (const val of newCj) {
            const numVal = parseInputString(val);
            if (isNaN(numVal)) {
                Alert.alert("Error", `Invalid input: "${val}"`);
                return;
            }
            c_hat_vector.push(numVal);
        }

        // Rebuild the simplex table with new cost vector
        // Extract only constraint rows (exclude Zj and Zj-Cj rows)
        const rowsCount = finalTable.length - 2;
        const newTable: number[][] = [];
        
        for (let i = 0; i < rowsCount; i++) {
            newTable.push([...finalTable[i]]);
        }

        // Navigate to Solution.tsx (simple simplex solver) with pre-built table
        router.push({
            pathname: '/(tabs)/GeneralSimplexSolver',
            params: {
                initialTable: JSON.stringify(newTable),
                variables: JSON.stringify(variables),
                basicVariables: JSON.stringify(basicVariables),
                cj: JSON.stringify(c_hat_vector),
                optType: optType,
                reason: `Cost vector changed. Continuing from current basis with new objective coefficients.`,
            }
        });
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>🎯 Objective Coefficient Change</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>What is this?</Text>
                    <Text style={styles.infoText}>
                        {`• Enter new objective function coefficients (ĉ).
• CASE I (Non-basic variable): Z unchanged, only (Cj-Zj) affected.
• CASE II (Basic variable): Both Z and (Cj-Zj) change.
• If any new (Cj-Zj) violates optimality → Re-solve with Simplex.
• Otherwise → Current solution remains optimal.`}
                    </Text>
                </View>

                <View style={styles.inputSection}>
                    <Text style={styles.subHeading}>Test New Cost Vector (ĉ)</Text>

                    {originalCj.map((currentValue: number, index: number) => {
                        const varName = variables[index];
                        const isBasic = basicVariables.includes(varName);
                        
                        return (
                            <View key={index}>
                                <Text style={styles.label}>
                                    {varName} (Current: {decimalToFraction(currentValue)}) 
                                    <Text style={[styles.varType, { color: isBasic ? "#4CAF50" : "#FF9800" }]}>
                                        {" "}[{isBasic ? "BASIC" : "NON-BASIC"}]
                                    </Text>
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    value={newCj[index]}
                                    onChangeText={(text) => handleCjChange(text, index)}
                                    keyboardType="numbers-and-punctuation"
                                    placeholder={`Enter new coefficient for ${varName}`}
                                    placeholderTextColor="#ccc"
                                />
                            </View>
                        );
                    })}

                    <TouchableOpacity style={styles.analyzeButton} onPress={analyzeCostChange}>
                        <Text style={styles.analyzeButtonText}>Analyze Cost Change</Text>
                    </TouchableOpacity>

                    {analysisResult && (
                        <View style={[
                            styles.resultBox,
                            { 
                                backgroundColor: analysisResult.includes("⚠️") 
                                    ? "rgba(255, 152, 0, 0.2)" 
                                    : "rgba(76, 175, 80, 0.2)",
                                borderLeftColor: analysisResult.includes("⚠️") 
                                    ? "#FF9800" 
                                    : "#4CAF50"
                            }
                        ]}>
                            <Text style={styles.resultText}>{analysisResult}</Text>

                            {analysisResult.includes("⚠️") && (
                                <TouchableOpacity
                                    style={styles.simplexButton}
                                    onPress={proceedToSimplex}
                                >
                                    <Text style={styles.simplexButtonText}>
                                        🔄 Continue with Simplex Method
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>

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
        marginBottom: 15,
        textAlign: "center",
    },
    subHeading: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 10,
        marginTop: 10,
    },
    infoBox: {
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: "#2196F3",
    },
    infoTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 8,
    },
    infoText: {
        color: "#E0E0E0",
        fontSize: 14,
        lineHeight: 22,
    },
    inputSection: {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        padding: 15,
        borderRadius: 10,
        marginTop: 10,
    },
    label: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
        marginTop: 15,
        marginBottom: 8,
    },
    varType: {
        fontSize: 12,
        fontWeight: "bold",
    },
    input: {
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        borderWidth: 1,
        borderColor: "#fff",
        borderRadius: 8,
        padding: 12,
        color: "#fff",
        fontSize: 16,
        marginBottom: 10,
    },
    analyzeButton: {
        backgroundColor: "#2196F3",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 20,
    },
    analyzeButtonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
    resultBox: {
        padding: 15,
        borderRadius: 10,
        marginTop: 20,
        borderWidth: 2,
        borderColor: "#fff",
        borderLeftWidth: 4,
    },
    resultText: {
        color: "#fff",
        fontSize: 15,
        lineHeight: 22,
        fontWeight: "bold",
    },
    backButton: {
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 30,
    },
    backButtonText: {
        color: "#3b5998",
        fontWeight: "bold",
        fontSize: 16,
    },
    simplexButton: {
        backgroundColor: "#FF9800",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 20,
    },
    simplexButtonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
});