import { defineConfig } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import preferArrow from "eslint-plugin-prefer-arrow";

export default defineConfig(
    { ignores: ["**/node_modules", "**/dist", "**/out"] },
    tseslint.configs.recommended,
    eslintPluginReact.configs.flat.recommended,
    eslintPluginReact.configs.flat["jsx-runtime"],
    {
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "react-hooks": eslintPluginReactHooks,
            "react-refresh": eslintPluginReactRefresh,
            import: importPlugin,
            "simple-import-sort": simpleImportSort,
            "prefer-arrow": preferArrow,
        },
        rules: {
            ...eslintPluginReactHooks.configs.recommended.rules,
            ...eslintPluginReactRefresh.configs.vite.rules,

            // 마지막 요소에 항상 쉼표
            "comma-dangle": ["error", "always-multiline"],

            // 중괄호는 항상 사용
            curly: "error",

            // == 대신 === 사용
            eqeqeq: ["error", "always"],

            // import 정렬 자동화
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",

            // JSX에서 항상 더블 쿼테이션
            "jsx-quotes": ["error", "prefer-double"],

            // 클래스 멤버 사이에 항상 빈 줄
            "lines-between-class-members": ["error", "always"],

            // debugger 문 사용 금지
            "no-debugger": "error",

            // var 키워드 사용 금지
            "no-var": "error",

            // 객체 리터럴 중괄호 내부에 항상 공백
            "object-curly-spacing": ["error", "always"],

            // 함수/클래스/return 등 사이에 빈 줄 추가
            "padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "function", next: "function" },
                { blankLine: "always", prev: "class", next: "class" },
                { blankLine: "always", prev: "*", next: "return" },
            ],

            // const 사용 강제
            "prefer-const": "error",

            // 문자열은 항상 더블 쿼테이션
            quotes: ["error", "double"],

            // 세미콜론은 항상 사용
            semi: ["error", "always"],

            // 연속 빈 줄 최대 1줄, 파일 끝에 빈 줄 없음
            "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],

            // React
            "react/prop-types": "off",
            "react/react-in-jsx-scope": "off",

            // React Hooks
            "react-hooks/exhaustive-deps": "off",

            // TypeScript
            "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-empty-interface": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/no-non-null-assertion": "warn",
            "@typescript-eslint/no-unnecessary-type-constraint": "error",
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-redundant-type-constituents": "off",

            // 미사용 표현식
            "no-unused-expressions": "off",
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
    eslintConfigPrettier,
);
