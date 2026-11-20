---
description: "The web-search provider's settings page on the sqh web client's Plugins page: the Metaso route it uses, plus the key, endpoint and retrieval scope that belong to that provider."
kind: "package-reference"
---

# @liusiqi-dev/sqh-client-ui-settings-web-search

English | [中文](README.zh.md)

## Summary

Open **Plugins** in the sidebar and select **Web search** in the Official group. Web search uses Metaso and needs an API key. The page stages what is typed and writes it only on save. The key is written through the credentials domain under the `METASO_API_KEY` reference rather than the settings document, so its literal never rides a response. The page exists while the Host serves the `web-search-metaso` namespace.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The **Web search** card in the Official group opens the page. It shows three controls. **API key** starts blank on every load and reports only whether a key is configured; it is stored outside the settings file under the `METASO_API_KEY` reference, and a blank draft keeps the current key. **Endpoint** and **Retrieval scope** render the effective value, carry an **Overridden** badge with **Reset to default** once overridden, and save as a reset when emptied. Nothing is written until **Save**; leaving the page drops the drafts. The form is disabled when the plugin is not loaded or the deployment stores settings read-only.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals: click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `web-search-metaso` namespace through `ctx.configForms.get` and keeps the staged form in `WebSearchCardController` over the shared `SettingsFormModel` of `ui-primitives`, with the key as the form's one secret control: its write goes to `remote.credentials.set` under the reference the section's `apiKeyEnv` names (`METASO_API_KEY` when it names none), and success is read back from `remote.credentials.describe`. The controller re-reads the credential when the scope changes and when the Host reports `credentials/reference-updated` for the watched reference, since a key written on the Models page changes no settings section. The page registers `WebSearchCard` into the Plugins page's `plugins.item` slot through `ctx.configForms.whileServed`. On the provider side, the same reference is resolved from the credentials domain with a process-environment fallback, so a key written here or exported before launch both work.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-plugin-manager](../ui-plugin-manager/README.md), the Plugins page and the `plugins.item` slot the page registers into.
- [ui-settings](../ui-settings/README.md), the settings scope and the served-namespace watch the page rides.
- [ui-primitives](../ui-primitives/README.md), the settings form model and fields the page renders.
- [credentials](../../credentials/README.md), the credential-reference seam the key writes through.
- `web-search-metaso`, the provider that registers the namespace.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Only three fields are edited**: the page edits the key, the endpoint, and the retrieval scope; the provider's `includeSummary` and `conciseSnippet` stay at their composed values.
- **Runtime invariant:** No companion is published. The page holds no owned relationship of its own: what it shows derives from the settings mirror and the credentials domain, and what it writes the Host validates.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers: click to expand</summary>

None.

</details>
