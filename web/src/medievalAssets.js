// Static character sculpts from King's Gambit — Medieval 3D Chess.
// Source and license: https://github.com/ade5791/rork-medieval-3d-chess (MIT).
// The procedural chess set remains available when a remote model cannot load.
const MODEL_BASE = 'https://r2-pub.rork.com/generated-3d-models/g9111r67kl6tq85g540sd';

export const medievalModelUrls = {
  w: {
    k: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8.glb`,
    q: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886.glb`,
    b: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72.glb`,
    n: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2.glb`,
    r: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1.glb`,
    p: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69.glb`,
  },
  b: {
    k: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7.glb`,
    q: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467.glb`,
    b: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb.glb`,
    n: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c.glb`,
    r: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee.glb`,
    p: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f.glb`,
  },
};
