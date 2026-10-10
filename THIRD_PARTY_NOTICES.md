# Third-party notices

## Microsoft Rocketbox Avatar Library

The 3D models (`public/models`), animation clips (`public/animations`), thumbnails (`public/thumbs`) and model metadata
in this repository are derived from the Microsoft Rocketbox Avatar Library:
https://github.com/microsoft/Microsoft-Rocketbox

Modifications: converted from FBX to glTF 2.0, textures downsized to 1024 px and re-encoded as WebP, geometry
compressed with meshoptimizer, vertex colours removed, hair materials switched to alpha-testing, animation clips
reduced to bone rotations plus root motion, and preview images trimmed and re-encoded as WebP.

If you use the avatars for research, the authors ask that you consider citing:
Gonzalez-Franco, M., et al. (2020). The Rocketbox Library and the Utility of Freely Available Rigged Avatars.
Frontiers in Virtual Reality, 1, 561558. https://doi.org/10.3389/frvir.2020.561558

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Kenney, KayKit and Polygonal Mind (CC0 1.0)

The models in `public/library/kenney`, `public/library/kaykit` and `public/library/polygonal-mind` are by
Kenney (www.kenney.nl), Kay Lousberg / KayKit (www.kaylousberg.com) and Polygonal Mind, dedicated to the public
domain under Creative Commons Zero v1.0 Universal (CC0 1.0):
https://creativecommons.org/publicdomain/zero/1.0/ — full text in `public/licenses/CC0-1.0.txt`.

Modifications: converted to single-file glTF 2.0 (.glb) with embedded WebP textures and meshopt compression;
skinned Kenney characters were converted from FBX with one model per skin.

## Sketchfab hairstyles (CC BY 4.0 / CC BY-ND 4.0)

The models in `public/library/hair` are by Sketchfab artists, under Creative Commons licenses that require credit
(full texts: `public/licenses/CC-BY-4.0.txt`, `public/licenses/CC-BY-ND-4.0.txt`):

- “Honoka Hair” by systemmanager — https://sketchfab.com/3d-models/honoka-hair-6f00d54f5f234b61a7b7d9eaa1b2efa8 — CC BY 4.0
- “Long Black Hair for Character” by Marc Sawyer — https://sketchfab.com/3d-models/long-black-hair-for-character-6c06611cf3454b978c01bb98368198b2 — CC BY 4.0
- “P8 Alyson- Hair Black reduced polys” by backdoor3d — https://sketchfab.com/3d-models/p8-alyson-hair-black-reduced-polys-0b70f16f8aca4d48bc0496f177ea5d0d — CC BY-ND 4.0
- “P8 Alyson- Hair Bum” by backdoor3d — https://sketchfab.com/3d-models/p8-alyson-hair-bum-c905952a03f74acca6082c551c0686c7 — CC BY-ND 4.0
- “Side Swept Bob Haircut” by zHairezt — https://sketchfab.com/3d-models/side-swept-bob-haircut-f3c0f129fcce45e99991959ac2b9c8ce — CC BY 4.0
- “Stylized Hair Aniso Test” by capa14 — https://sketchfab.com/3d-models/stylized-hair-aniso-test-9f8e1715671d49e6ab5066e1f99c9c72 — CC BY 4.0

Modifications: converted to single-file glTF 2.0 (.glb) with meshopt compression and WebP textures; Honoka Hair keeps
only the hair (the download also contains a small character body). Otherwise unchanged. The credit is embedded in each
.glb (`asset.copyright`) and shown on each model page.

## NASA 3D Resources (public domain)

The models in `public/library/nasa` come from NASA 3D Resources. NASA material is generally not subject to
copyright in the United States. NASA does not endorse this project; the NASA insignia and logos may not be used to
imply endorsement. See `public/licenses/NASA.txt` and https://www.nasa.gov/nasa-brand-center/images-and-media/.

## Tutorial narration (Chatterbox Turbo, voice by Alba MacKenna)

The narration of the Scene Builder tutorial videos in `public/tutorials` is synthesized speech, made with
Chatterbox Turbo by Resemble AI (MIT License, https://github.com/resemble-ai/chatterbox) in the voice of the
recording “A Moment By” by voice actor Alba MacKenna, from Kyutai's TTS voices collection
(https://huggingface.co/kyutai/tts-voices), licensed under Creative Commons Attribution 4.0 International:
https://creativecommons.org/licenses/by/4.0/ — full text in `public/licenses/CC-BY-4.0.txt`.

Modifications: the recording is used only as the voice reference; every word in the videos is generated. The
credit is shown on each tutorial page. The model and the recording are not part of this repository.
