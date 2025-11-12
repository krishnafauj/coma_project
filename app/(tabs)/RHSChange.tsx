import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Dimensions,
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

export default function RHSChange() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // Parse the stringified parameters
    const finalTable = JSON.parse(params.finalTable as string);
    const variables = JSON.parse(params.variables as string);
    const basicVariables = JSON.parse(params.basicVariables as string);
    const originalRHS = JSON.parse(params.originalRHS as string);
    const cj = JSON.parse(params.cj as string);
    const optType = params.optType as string;
    const bInverse = JSON.parse(params.bInverse as string);

    const [newRHSVector, setNewRHSVector] = useState<string[]>(
        originalRHS.map(String)
    );
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [newBasicSolution, setNewBasicSolution] = useState<number[] | null>(null);

    const parseInputString = (input: string): number => {
        const trimmedInput = input.trim();

        if (trimmedInput.includes('/')) {
            const parts = trimmedInput.split('/');
            if (parts.length !== 2) {
                return NaN;
            }
            const numerator = parseFloat(parts[0]);
            const denominator = parseFloat(parts[1]);

            if (denominator === 0 || isNaN(numerator) || isNaN(denominator)) {
                return NaN;
            }
            return numerator / denominator;
        } else {
            return parseFloat(trimmedInput);
        }
    };

    const handleRHSChange = (text: string, index: number) => {
        const updatedVector = [...newRHSVector];
        updatedVector[index] = text;
        setNewRHSVector(updatedVector);
    };

    const analyzeRHSChange = () => {
        const b_hat_vector: number[] = [];
        for (const val of newRHSVector) {
            const numVal = parseInputString(val);

            if (isNaN(numVal)) {
                Alert.alert("Error", `Invalid input: "${val}". Please enter a valid number, decimal, or fraction (e.g., 5, 0.5, or 1/2).`);
                return;
            }
            b_hat_vector.push(numVal);
        }

        const m = originalRHS.length;
        const x_B_hat_vector: number[] = [];
        let isInfeasible = false;

        // Calculate x_B_hat = B_inv * b_hat
        for (let i = 0; i < m; i++) {
            let sum = 0;
            for (let j = 0; j < m; j++) {
                sum += bInverse[i][j] * b_hat_vector[j];
            }
            x_B_hat_vector.push(sum);
            if (sum < -1e-9) {
                isInfeasible = true;
            }
        }

        setNewBasicSolution(x_B_hat_vector);

        if (isInfeasible) {
            setAnalysisResult(
                `⚠️ ORIGINAL BASIS IS NO LONGER FEASIBLE\n\n` +
                `One or more new basic variables (x\u0302_B) are negative.\n\n` +
                `The dual simplex method is required to find the new optimal solution.`
            );
        } else {
            setAnalysisResult(
                `✅ ORIGINAL BASIS REMAINS FEASIBLE\n\n` +
                `All new basic variables (x\u0302_B) are non-negative.\n\n` +
                `The solution is still optimal, only the values of the basic variables and Z have changed.`
            );
        }
    };

    const proceedToDualSimplex = () => {
        if (!newBasicSolution) {
            Alert.alert("Error", "Please run feasibility check first");
            return;
        }

        const b_hat_vector: number[] = [];
        for (const val of newRHSVector) {
            const numVal = parseInputString(val);
            if (isNaN(numVal)) {
                Alert.alert("Error", `Invalid input: "${val}"`);
                return;
            }
            b_hat_vector.push(numVal);
        }

        const rowsCount = finalTable.length - 2;
        const newTable: number[][] = [];

        // Reconstruct the table with new RHS values
        for (let i = 0; i < rowsCount; i++) {
            const newRow = [...finalTable[i]];
            newRow[newRow.length - 1] = newBasicSolution[i]; // ← Use calculated new basic solution
            newTable.push(newRow);
        }

        // Add placeholder Zj and Zj-Cj rows
        const cols = finalTable[0].length;
        newTable.push(Array(cols).fill(0));
        newTable.push(Array(cols).fill(0));

        const infeasibleReason =
            `Original basis became infeasible after changing RHS vector.\n\n` +
            `Old RHS: [${originalRHS.map((v: number) => decimalToFraction(v)).join(', ')}]\n` +
            `New RHS: [${b_hat_vector.map(v => decimalToFraction(v)).join(', ')}]\n\n` +
            `One or more basic variables became negative.\n` +
            `Applying Dual Simplex to restore feasibility.`;

        router.push({
            pathname: '/(tabs)/DualSimplexSolver',
            params: {
                initialTable: JSON.stringify(newTable),
                variables: JSON.stringify(variables),
                basicVariables: JSON.stringify(basicVariables),
                cj: JSON.stringify(cj),
                optType: optType,
                infeasibleReason: infeasibleReason,
            }
        });
    };

    const renderNewSolution = () => {
        if (!newBasicSolution) return null;

        return (
            <View style={styles.solutionBox}>
                <Text style={styles.solutionTitle}>New Basic Solution (x̂_B):</Text>
                {newBasicSolution.map((value, index) => (
                    <Text key={index} style={[
                        styles.solutionText,
                        value < -1e-9 && styles.solutionTextNegative
                    ]}>
                        {basicVariables[index]} = {decimalToFraction(value)}
                    </Text>
                ))}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>📊 RHS Feasibility Check</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>What is this?</Text>
                    <Text style={styles.infoText}>
                        {`• Enter a new resource vector (\u0062\u0302).
• The app calculates the new basic solution \u0078\u0302_B = B\u207B\u00B9\u0062\u0302.
• It checks if all \u0078\u0302_B \u2265 0.
• If YES: The basis is still feasible (and optimal).
• If NO: The basis is infeasible, and the Dual Simplex method is needed.`}
                    </Text>
                </View>

                <View style={styles.inputSection}>
                    <Text style={styles.subHeading}>Test New RHS Vector (b̂)</Text>

                    {originalRHS.map((currentValue: number, index: number) => (
                        <View key={index}>
                            <Text style={styles.label}>
                                Constraint {index + 1} (Current: {decimalToFraction(currentValue)})
                            </Text>
                            <TextInput
                                style={styles.input}
                                value={newRHSVector[index]}
                                onChangeText={(text) => handleRHSChange(text, index)}
                                keyboardType="numbers-and-punctuation"
                                placeholder={`Enter new value for b_${index + 1}`}
                                placeholderTextColor="#ccc"
                            />
                        </View>
                    ))}

                    <TouchableOpacity style={styles.analyzeButton} onPress={analyzeRHSChange}>
                        <Text style={styles.analyzeButtonText}>Verify Feasibility</Text>
                    </TouchableOpacity>

                    {analysisResult && (
                        <View style={[
                            styles.resultBox,
                            { backgroundColor: analysisResult.includes("⚠️") ? "rgba(255, 152, 0, 0.2)" : "rgba(76, 175, 80, 0.2)" }
                        ]}>
                            <Text style={styles.resultText}>{analysisResult}</Text>
                            {renderNewSolution()}

                            {analysisResult.includes("⚠️") && (
                                <TouchableOpacity
                                    style={styles.dualSimplexButton}
                                    onPress={proceedToDualSimplex}
                                >
                                    <Text style={styles.dualSimplexButtonText}>
                                        🔄 Apply Dual Simplex Method
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
        borderLeftColor: "#4CAF50",
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
        backgroundColor: "#4CAF50",
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
    },
    resultText: {
        color: "#fff",
        fontSize: 15,
        lineHeight: 22,
        fontWeight: "bold",
    },
    solutionBox: {
        marginTop: 15,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.3)",
    },
    solutionTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 8,
    },
    solutionText: {
        color: "#fff",
        fontSize: 15,
        marginBottom: 5,
        fontFamily: "monospace",
    },
    solutionTextNegative: {
        color: "#FFEB3B",
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
    dualSimplexButton: {
        backgroundColor: "#FF9800",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 20,
    },
    dualSimplexButtonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
});