Snapshot 2026-11-20, index 96806169a755, 360 chunks, v22.16.0, generated 2026-11-20T09:44:09.228Z.

#### Extractive provider, split: test

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 87 | 91.3 | 100 | 0.911 | 91.3 | 83.3 | 73.3 | 100 | 0 | 100 | 1.39 | 4.2 |
| bm25+rerank | 87 | 91.3 | 100 | 0.909 | 91.3 | 82.6 | 73.3 | 100 | 0 | 100 | 1.35 | 3.59 |
| dense | 91.3 | 95.7 | 100 | 0.946 | 100 | 84.9 | 84.6 | 93.1 | 8.7 | 100 | 7.86 | 12.17 |
| hybrid | 87 | 100 | 100 | 0.928 | 95.7 | 79.7 | 80 | 100 | 0 | 100 | 9.54 | 12.8 |
| hybrid+rerank | 87 | 95.7 | 100 | 0.914 | 91.3 | 84.1 | 73.3 | 100 | 0 | 100 | 9.47 | 13.29 |

#### Extractive provider, split: dev

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 100 | 100 | 100 | 1 | 100 | 90.9 | 100 | 96.6 | 4.3 | 100 | 1.65 | 6.57 |
| bm25+rerank | 100 | 100 | 100 | 1 | 100 | 96.2 | 100 | 96.6 | 4.3 | 100 | 1.42 | 3.98 |
| dense | 95.7 | 100 | 100 | 0.978 | 100 | 92.5 | 90.9 | 89.7 | 13 | 100 | 8.42 | 11.22 |
| hybrid | 100 | 100 | 100 | 1 | 100 | 89.4 | 100 | 96.6 | 4.3 | 100 | 10.11 | 13.85 |
| hybrid+rerank | 100 | 100 | 100 | 1 | 100 | 97.7 | 100 | 96.6 | 4.3 | 100 | 10.33 | 14.59 |

#### Extractive provider, split: all

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 93.5 | 95.7 | 100 | 0.955 | 95.6 | 87 | 85.2 | 98.3 | 2.2 | 100 | 1.64 | 4.34 |
| bm25+rerank | 93.5 | 95.7 | 100 | 0.954 | 95.6 | 89.3 | 85.2 | 98.3 | 2.2 | 100 | 1.41 | 3.9 |
| dense | 93.5 | 97.8 | 100 | 0.962 | 100 | 88.6 | 87.5 | 91.4 | 10.9 | 100 | 8.13 | 12.17 |
| hybrid | 93.5 | 100 | 100 | 0.964 | 97.8 | 84.4 | 88.9 | 98.3 | 2.2 | 100 | 9.55 | 13.85 |
| hybrid+rerank | 93.5 | 97.8 | 100 | 0.957 | 95.6 | 90.7 | 85.2 | 98.3 | 2.2 | 100 | 9.69 | 14.59 |

#### Extractive provider, split: en

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 89.3 | 92.9 | 100 | 0.927 | 92.6 | 84 | 83.3 | 97.2 | 3.6 | 100 | 1.39 | 4.34 |
| bm25+rerank | 89.3 | 92.9 | 100 | 0.925 | 92.6 | 85.8 | 83.3 | 97.2 | 3.6 | 100 | 1.28 | 2.29 |
| dense | 89.3 | 96.4 | 100 | 0.938 | 100 | 88.9 | 93.8 | 88.9 | 14.3 | 100 | 7.6 | 10.06 |
| hybrid | 89.3 | 100 | 100 | 0.94 | 96.3 | 82.7 | 88.9 | 97.2 | 3.6 | 100 | 8.92 | 11.8 |
| hybrid+rerank | 89.3 | 96.4 | 100 | 0.93 | 92.6 | 88.3 | 83.3 | 97.2 | 3.6 | 100 | 8.99 | 12.2 |

#### Extractive provider, split: ar

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 100 | 100 | 100 | 1 | 100 | 91.7 | 88.9 | 100 | 0 | 100 | 2.53 | 4.2 |
| bm25+rerank | 100 | 100 | 100 | 1 | 100 | 94.4 | 88.9 | 100 | 0 | 100 | 2.51 | 3.98 |
| dense | 100 | 100 | 100 | 1 | 100 | 88.2 | 75 | 95.5 | 5.6 | 100 | 8.82 | 12.2 |
| hybrid | 100 | 100 | 100 | 1 | 100 | 87 | 88.9 | 100 | 0 | 100 | 10.64 | 15.27 |
| hybrid+rerank | 100 | 100 | 100 | 1 | 100 | 94.4 | 88.9 | 100 | 0 | 100 | 10.98 | 14.59 |

#### Generative provider (local-llm), all questions

| config | hit@1 | hit@3 | hit@5 | MRR | citation acc. | citation prec. | fact recall | refusal correct. | false refusals | numbers grounded | retrieve p50 ms | total p95 ms | stripped sentences | extractive fallbacks | generate p50 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bm25+rerank | 93.5 | 95.7 | 100 | 0.954 | 95.6 | 88.1 | 85.2 | 98.3 | 2.2 | 100 | 3.51 | 23764.85 | 55 | 45 | 11831 |
