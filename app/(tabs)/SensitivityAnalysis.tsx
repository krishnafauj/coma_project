import React from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from "react-native";
import {
    useRoute,
    useNavigation,
    NavigationProp,
    RouteProp,
} from "@react-navigation/native";

type RootStackParamList = {
    Home: undefined;
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
    RHSChange: {
        finalTable: string;
        variables: string;
        basicVariables: string;
        cj: string;
        constraintsMatrix: string;
        originalRHS: string;
        bInverse: string;
        optType: string;
    };
    ObjectiveChange: {
        finalTable: string;
        variables: string;
        basicVariables: string;
        cj: string;
        optType: string;
        originalObjective: string;
        variableSigns: string;
    };
    NewVariable: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
    };
    NewConstraint: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
    };
    ShadowPrices: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
    };
    RangingAnalysis: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
    };
    SensitivitySummary: {
        finalTable: number[][];
        variables: string[];
        basicVariables: string[];
        cj: number[];
        optType: string;
    };
};

type SensitivityRouteProp = RouteProp<RootStackParamList, "SensitivityAnalysis">;

interface SensitivityOption {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
    route: keyof RootStackParamList;
}

export default function SensitivityAnalysis() {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const route = useRoute<SensitivityRouteProp>();
    const {
        finalTable,
        variables,
        basicVariables,
        cj,
        optType,
        originalObjective,
        variableSigns,
        constraintsMatrix,
        originalRHS,
    } = route.params;

    const sensitivityOptions: SensitivityOption[] = [
        {
            id: "rhs",
            title: "Change in Resource Vector (RHS)",
            description: "Analyze how changes in constraint RHS values affect the optimal solution",
            icon: "📊",
            color: "#4CAF50",
            route: "RHSChange",
        },
        {
            id: "objective",
            title: "Change in Objective Coefficients",
            description: "Determine the range where objective coefficients can vary",
            icon: "🎯",
            color: "#2196F3",
            route: "ObjectiveChange",
        },
        {
            id: "new_variable",
            title: "Addition of New Variable",
            description: "Evaluate the impact of introducing a new decision variable",
            icon: "➕",
            color: "#FF9800",
            route: "NewVariable",
        },
        {
            id: "new_constraint",
            title: "Addition of New Constraint",
            description: "Analyze the effect of adding a new constraint to the problem",
            icon: "🔗",
            color: "#9C27B0",
            route: "NewConstraint",
        },
        {
            id: "shadow_price",
            title: "Shadow Prices & Dual Values",
            description: "View the shadow prices and dual variable values",
            icon: "💰",
            color: "#F44336",
            route: "ShadowPrices",
        },
        {
            id: "ranging",
            title: "Ranging Analysis",
            description: "Comprehensive ranging for all variables and constraints",
            icon: "📈",
            color: "#00BCD4",
            route: "RangingAnalysis",
        },
        {
            id: "summary",
            title: "Sensitivity Summary Report",
            description: "View complete sensitivity analysis summary",
            icon: "📋",
            color: "#607D8B",
            route: "SensitivitySummary",
        },
    ];

    const handleOptionPress = (option: SensitivityOption) => {
        if (option.route === "RHSChange") {
            // Calculate B-inverse
            const m = finalTable.length - 2;
            const bInv: number[][] = [];

            for (let i = 0; i < m; i++) {
                const row: number[] = [];
                for (let j = 0; j < m; j++) {
                    const slackVar = `s${j + 1}`;
                    const idx = variables.indexOf(slackVar);

                    if (idx !== -1) {
                        row.push(finalTable[i][idx]);
                    } else {
                        row.push(i === j ? 1 : 0);
                    }
                }
                bInv.push(row);
            }

            navigation.navigate(option.route, {
                finalTable: JSON.stringify(finalTable),
                variables: JSON.stringify(variables),
                basicVariables: JSON.stringify(basicVariables),
                cj: JSON.stringify(cj),
                constraintsMatrix: JSON.stringify(constraintsMatrix),
                originalRHS: JSON.stringify(originalRHS),
                bInverse: JSON.stringify(bInv),
                optType: optType,
            });
        } else if (option.route === "ObjectiveChange") {
            // Navigate to ObjectiveChange with all necessary parameters
            navigation.navigate(option.route, {
                finalTable: JSON.stringify(finalTable),
                variables: JSON.stringify(variables),
                basicVariables: JSON.stringify(basicVariables),
                cj: JSON.stringify(cj),
                optType: optType,
                originalObjective: JSON.stringify(originalObjective),
                variableSigns: JSON.stringify(variableSigns),
            });
        } else {
            alert(`${option.title} - Coming Soon!`);
        }
    };

    const handleGoBack = () => {
        navigation.goBack();
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.heading}>📊 Sensitivity Analysis</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        Sensitivity analysis helps determine how changes in parameters
                        affect the optimal solution without re-solving the entire problem.
                    </Text>
                </View>

                <View style={styles.optionsContainer}>
                    {sensitivityOptions.map((option) => (
                        <TouchableOpacity
                            key={option.id}
                            style={[styles.optionCard, { borderLeftColor: option.color }]}
                            onPress={() => handleOptionPress(option)}
                        >
                            <View style={styles.optionHeader}>
                                <Text style={styles.optionIcon}>{option.icon}</Text>
                                <Text style={styles.optionTitle}>{option.title}</Text>
                            </View>
                            <Text style={styles.optionDescription}>
                                {option.description}
                            </Text>
                            <View style={[styles.statusBadge,
                            { backgroundColor: 
                                (option.route === "RHSChange" || option.route === "ObjectiveChange") 
                                    ? "#4CAF50" 
                                    : "#9E9E9E" 
                            }]}>
                                <Text style={styles.statusText}>
                                    {(option.route === "RHSChange" || option.route === "ObjectiveChange") 
                                        ? "Available" 
                                        : "Coming Soon"}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
                    <Text style={styles.backButtonText}>← Back to Phase 2</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#3b5998",
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    heading: {
        color: "#fff",
        fontSize: 26,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    infoBox: {
        backgroundColor: "rgba(255, 255, 255, 0.15)",
        padding: 15,
        borderRadius: 10,
        marginBottom: 25,
        borderLeftWidth: 4,
        borderLeftColor: "#FFD54F",
    },
    infoText: {
        color: "#fff",
        fontSize: 14,
        lineHeight: 20,
    },
    optionsContainer: {
        marginBottom: 20,
    },
    optionCard: {
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        padding: 18,
        borderRadius: 12,
        marginBottom: 15,
        borderLeftWidth: 5,
    },
    optionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    optionIcon: {
        fontSize: 28,
        marginRight: 12,
    },
    optionTitle: {
        color: "#fff",
        fontSize: 17,
        fontWeight: "bold",
        flex: 1,
    },
    optionDescription: {
        color: "#E0E0E0",
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    statusBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 15,
    },
    statusText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "bold",
    },
    backButton: {
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 30,
        alignItems: "center",
        marginTop: 10,
    },
    backButtonText: {
        color: "#3b5998",
        fontWeight: "bold",
        fontSize: 16,
    },
});