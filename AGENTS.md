<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Save node cutoff policies through the authenticated, security-invoker `save_cutoff_policy_with_nodes` RPC so policy, router, client, and service changes commit atomically under existing RLS.
- Use the service node-policy trigger for new or reassigned services so client billing dates and automatic suspension inherit the selected node's policy without rewriting invoices or payments.
- Read the client's assigned policy for billing-cycle presentation; existing invoice due dates are historical records, not the policy schedule, and must remain unchanged.
