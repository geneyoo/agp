# ChatGPT Actions Binding

ChatGPT Actions binding helpers.

This binding treats ChatGPT Actions as a hosted harness over REST/OpenAPI.

Implemented helpers:

- recommended ChatGPT Actions harness identifier
- ChatGPT-style grant shape creation
- OpenAPI 3.1 document generation for the mock provider
- consequential write annotations for supported hosts
- receipt and confirmation response schemas

Note: the hardened mock provider demonstrates DPoP-bound tokens. A hosted ChatGPT Actions deployment may need a bearer-token credential custody profile when the host does not expose DPoP proof generation to the action backend.
