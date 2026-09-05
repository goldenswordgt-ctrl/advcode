export * as Catalog from "./catalog"

import { define, inventory } from "./event"
import { Schema } from "effect"

const Updated = define({ type: "catalog.updated", schema: {} })
const ProviderAdded = define({ type: "catalog.provider.added", schema: { providerID: Schema.String } })
const ProviderRemoved = define({ type: "catalog.provider.removed", schema: { providerID: Schema.String } })
const ModelAdded = define({ type: "catalog.model.added", schema: { providerID: Schema.String, modelID: Schema.String } })
const ModelRemoved = define({
  type: "catalog.model.removed",
  schema: { providerID: Schema.String, modelID: Schema.String },
})
export const Event = {
  Updated,
  ProviderAdded,
  ProviderRemoved,
  ModelAdded,
  ModelRemoved,
  Definitions: inventory(Updated, ProviderAdded, ProviderRemoved, ModelAdded, ModelRemoved),
}