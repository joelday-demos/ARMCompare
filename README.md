# React + TypeScript + Vite

This app can visualize and compare Azure infrastructure templates from:

- ARM JSON templates (`.json`)
- Bicep templates (`.bicep`)

You can also compare across formats directly (ARM vs Bicep), and each uploaded file shows a detected format badge in the UI.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Deploy To Azure

This project includes a PowerShell deployment script that:

- Builds the app
- Creates (or reuses) an Azure Resource Group
- Creates (or reuses) an Azure Storage Account with static website hosting enabled
- Uploads the built files from `dist` to the `$web` container

### Prerequisites

- Azure CLI installed (`az`)
- PowerShell 7+ (`pwsh`)
- Logged in to Azure: `az login`

### Run deployment

```powershell
npm run deploy:azure -- -ResourceGroupName armcompare-rg -StorageAccountName armcompareprod123 -Location eastus
```

Optional parameters:

- `-SubscriptionId <id>` to target a specific subscription
- `-SkipBuild` to skip running `npm run build`

Storage account naming rules apply: 3-24 chars, lowercase letters and numbers only.

## Generate ARM Template

Generate a reusable ARM template (and sample parameter file):

```powershell
npm run generate:arm
```

Generated files:

- `infra/arm/azure-static-website.template.json`
- `infra/arm/azure-static-website.parameters.sample.json`

You can regenerate them any time after template script changes.

## GitHub CI/CD (Azure)

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-azure.yml` that:

- Runs on push to `main` (and manual dispatch)
- Builds the app
- Logs in to Azure with OIDC
- Deploys infrastructure using ARM or Bicep template
- Uploads static website assets to `$web`

### Required GitHub Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Required GitHub Repository Variables

- `AZURE_RESOURCE_GROUP`
- `AZURE_STORAGE_ACCOUNT`
- `AZURE_LOCATION` (optional, defaults to `eastus`)
- `AZURE_TEMPLATE_TYPE` (optional: `arm` or `bicep`, defaults to `arm`)
- `AZURE_TEMPLATE_FILE` (optional: custom path to a template file)

### Default template paths

- ARM: `infra/arm/azure-static-website.template.json`
- Bicep: `infra/bicep/azure-static-website.bicep`

To use Bicep in GitHub Actions, set repository variable:

- `AZURE_TEMPLATE_TYPE = bicep`

### Azure setup for OIDC

Create an Entra application/service principal with federated credentials for your GitHub repo, then grant it access to the target resource group (for example `Contributor` and `Storage Blob Data Contributor`).

After that, pushing to `main` triggers deployment automatically.
