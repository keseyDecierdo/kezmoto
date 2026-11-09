# KEZMOTO face-service

A private Python API that checks whether the face in a user's live selfie is
the same person as the face on their uploaded valid ID.

Only the Supabase `face-match` Edge Function calls it.

## How it works

1. Finds the face on the ID (the largest face, which is the printed portrait)
   and the single face in the selfie.
2. The `face_recognition` library (dlib's pre-trained model) turns each face
   into a 128-number "face fingerprint".
3. Rule: **distance <= 0.4 means the same person.** Lower means more similar.
   0.6 is the library default. 0.4 is used because dlib's model rates
   different people of the same (especially Asian) ethnicity as too close,
   and 0.5 let a different person through in testing.

It only compares face geometry. It does not look at gender, age or any other
attribute. Photos are processed in memory and never saved.

## API

`POST /compare`, header `Authorization: Bearer <FACE_SERVICE_SECRET>`

```json
{ "id_image": "<base64>", "selfie_image": "<base64>" }
```

Response:

```json
{ "id_faces": 1, "selfie_faces": 1, "distance": 0.38, "matched": true, "threshold": 0.5 }
```

`GET /health` returns `{"ok": true}`.

## Environment variables

| Name | Meaning |
|---|---|
| `FACE_SERVICE_SECRET` | Shared secret. Must equal the Supabase secret of the same name. |
| `FACE_MATCH_THRESHOLD` | Max distance for a match. Default `0.4`. |

## Deploy

Defined in the repo's `render.yaml` as `kezmoto-face-service` (Docker, free plan).
