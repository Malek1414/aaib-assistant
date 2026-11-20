Snapshot 2026-11-20-v2, index fcc7c59a1571, 360 chunks, v22.16.0, generated 2026-11-20T10:21:37.833Z.

#### Extractive provider, split: test

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 87 | 91.3 | 100 | 0.911 | 91.3 | 83.3 | 73.3 | 100 | 0 | 100 | 1.86 | 5.02 |
| bm25+rerank | 87 | 91.3 | 100 | 0.909 | 91.3 | 82.6 | 73.3 | 100 | 0 | 100 | 1.76 | 5.06 |
| dense | 91.3 | 95.7 | 100 | 0.946 | 100 | 84.9 | 84.6 | 93.1 | 8.7 | 100 | 11.59 | 20.94 |
| hybrid | 87 | 100 | 100 | 0.928 | 95.7 | 79.7 | 80 | 100 | 0 | 100 | 12.71 | 23.72 |
| hybrid+rerank | 87 | 95.7 | 100 | 0.914 | 91.3 | 84.1 | 73.3 | 100 | 0 | 100 | 12.59 | 24.28 |

#### Extractive provider, split: dev

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 100 | 100 | 100 | 1 | 100 | 90.9 | 100 | 96.6 | 4.3 | 100 | 2.2 | 8.24 |
| bm25+rerank | 100 | 100 | 100 | 1 | 100 | 96.2 | 100 | 96.6 | 4.3 | 100 | 1.97 | 4.99 |
| dense | 95.7 | 100 | 100 | 0.978 | 100 | 92.5 | 90.9 | 89.7 | 13 | 100 | 11.26 | 18.23 |
| hybrid | 100 | 100 | 100 | 1 | 100 | 89.4 | 100 | 96.6 | 4.3 | 100 | 13.76 | 28.78 |
| hybrid+rerank | 100 | 100 | 100 | 1 | 100 | 97.7 | 100 | 96.6 | 4.3 | 100 | 12.51 | 21.91 |

#### Extractive provider, split: all

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 93.5 | 95.7 | 100 | 0.955 | 95.6 | 87 | 85.2 | 98.3 | 2.2 | 100 | 2.09 | 5.11 |
| bm25+rerank | 93.5 | 95.7 | 100 | 0.954 | 95.6 | 89.3 | 85.2 | 98.3 | 2.2 | 100 | 1.88 | 5.06 |
| dense | 93.5 | 97.8 | 100 | 0.962 | 100 | 88.6 | 87.5 | 91.4 | 10.9 | 100 | 11.37 | 20.94 |
| hybrid | 93.5 | 100 | 100 | 0.964 | 97.8 | 84.4 | 88.9 | 98.3 | 2.2 | 100 | 12.85 | 26.91 |
| hybrid+rerank | 93.5 | 97.8 | 100 | 0.957 | 95.6 | 90.7 | 85.2 | 98.3 | 2.2 | 100 | 12.59 | 24.28 |

#### Extractive provider, split: en

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 89.3 | 92.9 | 100 | 0.927 | 92.6 | 84 | 83.3 | 97.2 | 3.6 | 100 | 1.86 | 5.02 |
| bm25+rerank | 89.3 | 92.9 | 100 | 0.925 | 92.6 | 85.8 | 83.3 | 97.2 | 3.6 | 100 | 1.66 | 3.19 |
| dense | 89.3 | 96.4 | 100 | 0.938 | 100 | 88.9 | 93.8 | 88.9 | 14.3 | 100 | 11.06 | 20.94 |
| hybrid | 89.3 | 100 | 100 | 0.94 | 96.3 | 82.7 | 88.9 | 97.2 | 3.6 | 100 | 12.25 | 24.11 |
| hybrid+rerank | 89.3 | 96.4 | 100 | 0.93 | 92.6 | 88.3 | 83.3 | 97.2 | 3.6 | 100 | 11.67 | 28.35 |

#### Extractive provider, split: ar

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 100 | 100 | 100 | 1 | 100 | 91.7 | 88.9 | 100 | 0 | 100 | 3.25 | 5.11 |
| bm25+rerank | 100 | 100 | 100 | 1 | 100 | 94.4 | 88.9 | 100 | 0 | 100 | 3.1 | 5.64 |
| dense | 100 | 100 | 100 | 1 | 100 | 88.2 | 75 | 95.5 | 5.6 | 100 | 12.11 | 18.85 |
| hybrid | 100 | 100 | 100 | 1 | 100 | 87 | 88.9 | 100 | 0 | 100 | 15.21 | 26.91 |
| hybrid+rerank | 100 | 100 | 100 | 1 | 100 | 94.4 | 88.9 | 100 | 0 | 100 | 14.33 | 20.76 |

#### Generative provider (local-llm), all questions

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms | stripped sentences | extractive fallbacks | generate p50 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25+rerank | 93.5 | 95.7 | 100 | 0.954 | 95.6 | 88.1 | 85.2 | 98.3 | 2.2 | 100 | 3.51 | 23764.85 | 55 | 45 | 11831 |

<!-- notes: kept by eval/table.ts -->
## Snapshot 2026-11-20 -> 2026-11-20-v2 (links), before and after

v2 was rebuilt offline from the cached archive captures: 0 network requests and the same 84 capture SHA-256s. Its chunk text is byte-identical to 2026-11-20; it only adds `links` to pages and chunks. The index hash moved from `96806169a755` to `fcc7c59a1571`, and the embeddings were recomputed for the new index.

`npm run eval` was run on both, for all 5 configs and all splits (dev, test, all, en, ar). Every quality metric is identical: hit@k, MRR, citation accuracy and precision, fact recall, refusal correctness, false refusals and numbers grounded. That is the expected result, because retrieval and answer text never read `links`. Latency columns differ between runs only by noise.

| bm25+rerank, split all | hit@1 | hit@3 | MRR | citation prec. | fact recall | refusal correct. | false refusals |
|---|---:|---:|---:|---:|---:|---:|---:|
| before (2026-11-20, 96806169a755) | 93.5 | 95.7 | 0.954 | 89.3 | 85.2 | 98.3 | 2.2 |
| after (2026-11-20-v2, fcc7c59a1571) | 93.5 | 95.7 | 0.954 | 89.3 | 85.2 | 98.3 | 2.2 |

What changed for users, measured on the golden set with bm25+rerank:
- 13 of 45 answered questions now show useful links: 21 links in total, 12 phone, 4 e-mail, 3 page, 2 app store.
- All 13 refusals show the hotline link and the contact page.

The generative (local-llm) table above was measured on 2026-11-20. It was not re-run, because the chunk text it reads is unchanged.

## Extraction: Searchify vs structured

The same 68 captures were built three ways, re-embedded and evaluated:
- `legacy`: the structured HTML/RSC extractor.
- `gate`: Searchify's main-text detection in front of the structured extractor.
- `searchify`: Searchify's Markdown as the blocks.

Both Searchify variants fail the golden self-check: 3 expected facts disappear from the "You matter" page. They were scored with `--skip-golden-check`.

| variant | config | split | hit@1 | hit@3 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| legacy | bm25+rerank | dev | 100 | 100 | 1 | 100 | 96.2 | 100 | 96.6 | 4.3 |
| gate | bm25+rerank | dev | 91.3 | 91.3 | 0.913 | 100 | 97.4 | 90 | 86.2 | 17.4 |
| searchify | bm25+rerank | dev | 82.6 | 91.3 | 0.862 | 100 | 92.5 | 81.8 | 89.7 | 13 |
| legacy | hybrid | dev | 100 | 100 | 1 | 100 | 89.4 | 100 | 96.6 | 4.3 |
| gate | hybrid | dev | 87 | 95.7 | 0.922 | 100 | 95.1 | 100 | 79.3 | 26.1 |
| searchify | hybrid | dev | 87 | 91.3 | 0.9 | 100 | 91.2 | 88.9 | 79.3 | 26.1 |
| legacy | bm25+rerank | test | 87 | 91.3 | 0.909 | 91.3 | 82.6 | 73.3 | 100 | 0 |
| gate | bm25+rerank | test | 73.9 | 87 | 0.809 | 82.6 | 71 | 73.3 | 100 | 0 |
| searchify | bm25+rerank | test | 78.3 | 82.6 | 0.826 | 82.6 | 70.3 | 73.3 | 100 | 0 |
| legacy | hybrid | test | 87 | 100 | 0.928 | 95.7 | 79.7 | 80 | 100 | 0 |
| gate | hybrid | test | 78.3 | 95.7 | 0.87 | 91.3 | 70.3 | 73.3 | 100 | 0 |
| searchify | hybrid | test | 78.3 | 91.3 | 0.86 | 90.5 | 69.8 | 84.6 | 93.1 | 8.7 |

The decision was made on dev, and test agrees, so the default stays `legacy`. Reasons, from the page-level diff:
- Searchify drops the complaint-channels section of "You matter".
- It keeps 904 of the 1,088 text blocks the structured extractor keeps on HTML pages.
- What it adds is nav, footer and login text from its full-page fallback, plus rate tables with parallel tiers flattened into one cell.
