Below is a dynamic Ansible solution for your exact need:
Cluster already exists ✅
User gives a list of nodes to remove (ip:port) ✅
For each node:
detect whether it’s master or replica
if replica → del-node
if master:
if it owns slots → reshard ALL slots off to remaining masters
then del-node
==============
all slots from a master to ONE destination master (chosen automatically, optionally “spread” across remaining masters per removal)
=================
This is designed to run from a single control host (localhost) and execute Valkey CLI commands against a seed node.
===================
1) Example playbook: remove_nodes.yml
   ---
- name: Remove Valkey cluster nodes dynamically (master/replica aware)
  hosts: localhost
  gather_facts: false

  vars:
    seed_host: "10.0.0.11"
    seed_port: 7000

    # User provides nodes as ip:port strings
    nodes_to_remove:
      - "10.0.0.15:7000"
      - "10.0.0.16:7000"

    # If true: For masters, try to spread reshard destinations across remaining masters.
    spread_reshard: true

  tasks:
    - name: Validate input list
      ansible.builtin.assert:
        that:
          - nodes_to_remove is iterable
          - nodes_to_remove | length > 0
        fail_msg: "nodes_to_remove must be a non-empty list like ['ip:port','ip:port']"

    - name: Remove each requested node safely
      ansible.builtin.include_tasks: tasks/remove_one_valkey_node.yml
      loop: "{{ nodes_to_remove }}"
      loop_control:
        loop_var: target_node
===========================================================
2. 2) Task file: tasks/remove_one_valkey_node.yml

      ---
# Input: target_node = "ip:port"
# Uses: seed_host, seed_port, spread_reshard

- name: Read cluster nodes
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: cluster_nodes
  changed_when: false

- name: Find target node line
  ansible.builtin.set_fact:
    target_line: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', target_node)
          | list
          | first) | default('')
      }}

- name: Fail if target not found
  ansible.builtin.fail:
    msg: "Target {{ target_node }} not found in CLUSTER NODES (seed={{ seed_host }}:{{ seed_port }})."
  when: target_line == ''

- name: Parse target details
  ansible.builtin.set_fact:
    target_node_id: "{{ target_line.split()[0] }}"
    target_is_master: "{{ ' master ' in (' ' ~ target_line ~ ' ') }}"
    target_is_replica: "{{ (' slave ' in (' ' ~ target_line ~ ' ')) or (' replica ' in (' ' ~ target_line ~ ' ')) }}"
    # Slots typically appear at end of line after 'connected'
    target_slot_tokens: "{{ target_line.split()[8:] if (target_line.split() | length) > 8 else [] }}"

- name: Compute slot count owned by target (best-effort)
  ansible.builtin.set_fact:
    target_slots_count: >-
      {%- set total = 0 -%}
      {%- for r in target_slot_tokens -%}
      {%- if '-' in r -%}
      {%- set a = (r.split('-')[0] | int) -%}
      {%- set b = (r.split('-')[1] | int) -%}
      {%- set total = total + (b - a + 1) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ total }}
  when: target_is_master

# -------------------------
# If replica -> simple del-node
# -------------------------
- name: Delete replica node
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ target_node_id }}
  when: target_is_replica
  register: del_replica

# -------------------------
# If master -> reshard if it owns slots, then del-node
# -------------------------
- name: Build list of remaining masters (excluding target)
  ansible.builtin.set_fact:
    remaining_master_ids: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', ' master ')
          | reject('search', '^' ~ target_node_id)
          | map('regex_search', '^[0-9a-f]+')
          | select('string')
          | list)
      }}
  when: target_is_master

- name: Fail if trying to remove last master
  ansible.builtin.fail:
    msg: "Cannot remove master {{ target_node }} because it is the last remaining master."
  when: target_is_master and (remaining_master_ids | length == 0)

- name: Pick destination master id (simple or spread)
  ansible.builtin.set_fact:
    dest_master_id: >-
      {{
        (remaining_master_ids[(ansible_loop.index0 | default(0)) % (remaining_master_ids | length)])
        if spread_reshard else
        (remaining_master_ids[0])
      }}
  when: target_is_master

- name: Reshard all slots off the master (only if it owns slots)
  ansible.builtin.command: >
    valkey-cli --cluster reshard {{ seed_host }}:{{ seed_port }}
    --cluster-from {{ target_node_id }}
    --cluster-to {{ dest_master_id }}
    --cluster-slots {{ target_slots_count | int }}
    --cluster-yes
  when: target_is_master and (target_slots_count | int > 0)
  register: reshard_out

- name: Delete master node after reshard
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ target_node_id }}
  when: target_is_master
  register: del_master

- name: Print action summary
  ansible.builtin.debug:
    msg:
      - "Target: {{ target_node }}"
      - "NodeId: {{ target_node_id }}"
      - "Role: {{ 'master' if target_is_master else 'replica' }}"
      - "Slots moved: {{ target_slots_count | default(0) }}"
      - "Dest master: {{ dest_master_id | default('n/a') }}"
=====================================
to run
ansible-playbook remove_nodes.yml
ansible-playbook remove_nodes.yml \
  -e seed_host=10.0.0.11 -e seed_port=7000 \
  -e 'nodes_to_remove=["10.0.0.15:7000","10.0.0.16:7000"]'
=======================================================
  --------------------------------------------------------------------OPTION 2---------------
  Here are the safe, dynamic steps to remove one or more master nodes from a Valkey cluster (works the same as Redis cluster). This is the exact logic your automation (Ansible/Bash) should follow.
  Steps to remove master node(s) dynamically
1) Pick a healthy “seed” node

Use any remaining node to run cluster management commands:

seed = <any_active_node_ip:port>

This is the node your automation will call with valkey-cli --cluster ....

2) For each master target (ip:port) — discover its node-id + role + slots

Run:

valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES


From the output, find the line that matches target_ip:target_port and extract:

node_id

role (must be master for this flow)

slot ranges at the end (e.g., 0-5460 10923-16383)

If the target is actually a replica, you can skip resharding and just del-node.

3) Safety checks before moving slots

For a master, validate:

There is at least one other master remaining to receive slots.

The cluster is healthy enough to move slots (usually cluster_state:ok is preferred):

valkey-cli -h <seed_ip> -p <seed_port> CLUSTER INFO

4) Compute how many slots the master owns

From slot ranges, compute total slots:

For each range A-B, slots = B - A + 1

Sum across ranges

If slot count is 0, you can remove the master immediately (go to step 6).

5) Reshard: move ALL slots off the master

Pick a destination master (or multiple) dynamically:

simplest: pick the first remaining master

better: pick a master with fewer slots (more balanced)

best: spread across masters evenly (multi-pass)

Simple (single destination) reshard:

valkey-cli --cluster reshard <seed_ip:seed_port> \
  --cluster-from <source_master_node_id> \
  --cluster-to <dest_master_node_id> \
  --cluster-slots <slots_to_move> \
  --cluster-yes


After this, the target master should show no slot ranges.

Verify:

valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES

6) If the master has replicas, detach them cleanly (recommended)

Before deleting the master, make sure its replicas aren’t still pointing to it.

Options:

Preferred: re-replicate those replicas to another master:

On each replica node:

valkey-cli -h <replica_ip> -p <replica_port> CLUSTER REPLICATE <new_master_node_id>


(If you don’t do this, those replicas may become “orphaned” until cluster converges.)

7) Delete the master node from the cluster

Once slots are 0:

valkey-cli --cluster del-node <seed_ip:seed_port> <source_master_node_id>

8) Post-checks

Run:

valkey-cli -h <seed_ip> -p <seed_port> CLUSTER INFO
valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES


Confirm:

cluster_state:ok

slots coverage still OK

replicas attached to valid masters

Removing multiple masters in one run (dynamic sequencing)

When removing multiple masters, do it one master at a time:

Refresh CLUSTER NODES

Remove master A (reshard → del-node)

Refresh cluster view again

Remove master B

Repeat

This prevents stale node-ids / slot layouts during automation.
=============================================================================================Option3==============================================================
oPTION -3---------------
spread across all remaining masters (best balance)
Perfect — here’s the best-balance, dynamic shrink algorithm (spread slots across all remaining masters), plus a ready-to-drop-in Ansible task file that implements it.

Balanced removal steps (spread across all remaining masters)

For each master you want to remove:

Discover topology

CLUSTER NODES from a seed node

Identify:

source_master_id (node-id of master to remove)

list of remaining master node-ids (exclude the source)

Compute how many slots the source owns

Parse its slot ranges → source_slots_total

Compute a distribution plan across remaining masters

Let K = #remaining masters

Base = source_slots_total // K

Remainder = source_slots_total % K

Plan: first Remainder masters get Base+1, rest get Base

Execute multi-pass resharding

For each destination master dest[i]:

Move plan[i] slots from source → dest using:

valkey-cli --cluster reshard <seed> \
  --cluster-from <source_id> \
  --cluster-to <dest_id> \
  --cluster-slots <plan[i]> \
  --cluster-yes


This automatically picks slots to move; doing multiple passes spreads them.

Verify source now owns 0 slots

Refresh CLUSTER NODES and ensure source line has no slot ranges.

Repoint replicas that were replicating from the removed master (recommended)

For each replica of source, issue CLUSTER REPLICATE <some_remaining_master_id>.

Delete the master

valkey-cli --cluster del-node <seed> <source_master_id>

Ansible: balanced slot spread + delete master (dynamic)
Playbook usage example
# remove_masters_balanced.yml
- hosts: localhost
  gather_facts: false
  vars:
    seed_host: "10.0.0.11"
    seed_port: 7000
    masters_to_remove:
      - "10.0.0.15:7000"
      - "10.0.0.16:7000"
  tasks:
    - name: Remove each master (balanced reshard)
      ansible.builtin.include_tasks: tasks/remove_master_balanced.yml
      loop: "{{ masters_to_remove }}"
      loop_control:
        loop_var: target_master

Task file: tasks/remove_master_balanced.yml
---
# Input:
#   target_master = "ip:port"
# Vars required:
#   seed_host, seed_port

- name: Read cluster nodes
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: cluster_nodes
  changed_when: false

- name: Find target line
  ansible.builtin.set_fact:
    target_line: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', target_master)
          | list
          | first) | default('')
      }}

- name: Fail if target not found
  ansible.builtin.fail:
    msg: "Target master {{ target_master }} not found via seed {{ seed_host }}:{{ seed_port }}"
  when: target_line == ''

- name: Ensure target is a master
  ansible.builtin.fail:
    msg: "Target {{ target_master }} is not a master (line={{ target_line }})"
  when: "' master ' not in (' ' ~ target_line ~ ' ')"

- name: Parse source master id and slot tokens
  ansible.builtin.set_fact:
    source_id: "{{ target_line.split()[0] }}"
    # slot ranges typically appear at end after 'connected'
    source_slot_tokens: "{{ target_line.split()[8:] if (target_line.split() | length) > 8 else [] }}"

- name: Compute slots owned by source (best-effort)
  ansible.builtin.set_fact:
    source_slots_total: >-
      {%- set total = 0 -%}
      {%- for r in source_slot_tokens -%}
      {%- if '-' in r -%}
      {%- set a = (r.split('-')[0] | int) -%}
      {%- set b = (r.split('-')[1] | int) -%}
      {%- set total = total + (b - a + 1) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ total }}

- name: Collect remaining masters (excluding source)
  ansible.builtin.set_fact:
    remaining_master_ids: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', ' master ')
          | reject('search', '^' ~ source_id)
          | map('regex_search', '^[0-9a-f]+')
          | select('string')
          | list)
      }}

- name: Fail if no remaining masters to receive slots
  ansible.builtin.fail:
    msg: "Cannot remove {{ target_master }}; it is the last master."
  when: remaining_master_ids | length == 0

# ---- Balanced distribution plan ----
- name: Build balanced slot plan
  ansible.builtin.set_fact:
    k: "{{ remaining_master_ids | length }}"
    base: "{{ (source_slots_total | int) // (remaining_master_ids | length) }}"
    rem: "{{ (source_slots_total | int) % (remaining_master_ids | length) }}"

- name: Build per-destination move list [(dest_id, slots_to_move), ...]
  ansible.builtin.set_fact:
    move_plan: >-
      {%- set plan = [] -%}
      {%- for i in range(0, k | int) -%}
      {%- set slots = (base | int) + (1 if i < (rem | int) else 0) -%}
      {%- if slots > 0 -%}
      {%- set _ = plan.append([remaining_master_ids[i], slots]) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ plan }}

- name: Debug move plan
  ansible.builtin.debug:
    msg:
      - "Removing master {{ target_master }} node-id={{ source_id }}"
      - "Slots owned by source={{ source_slots_total }}"
      - "Remaining masters={{ remaining_master_ids }}"
      - "Move plan={{ move_plan }}"

# ---- Reshard in multiple passes to spread across all remaining masters ----
- name: Reshard pass: move planned slots from source to each remaining master
  ansible.builtin.command: >
    valkey-cli --cluster reshard {{ seed_host }}:{{ seed_port }}
    --cluster-from {{ source_id }}
    --cluster-to {{ item[0] }}
    --cluster-slots {{ item[1] }}
    --cluster-yes
  loop: "{{ move_plan }}"
  loop_control:
    label: "to={{ item[0] }} slots={{ item[1] }}"
  when: (source_slots_total | int) > 0
  register: reshard_results

# ---- Verify source has 0 slots now ----
- name: Re-read cluster nodes after reshard
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: nodes_after
  changed_when: false

- name: Verify source has no slot ranges
  ansible.builtin.set_fact:
    source_line_after: >-
      {{
        (nodes_after.stdout_lines
          | select('search', '^' ~ source_id)
          | list
          | first) | default('')
      }}

- name: Fail if source still owns slots
  ansible.builtin.fail:
    msg: "Source master still appears to own slots: {{ source_line_after }}"
  when: >
    (source_slots_total | int) > 0 and
    (source_line_after != '') and
    (
      (source_line_after.split() | length) > 8 and
      (source_line_after.split()[8:] | select('search','-') | list | length) > 0
    )

# ---- Repoint replicas of this master (recommended) ----
- name: Find replicas pointing to source master
  ansible.builtin.set_fact:
    replicas_of_source: >-
      {{
        (nodes_after.stdout_lines
          | select('search', 'slave ' ~ source_id)
          | list)
      }}

- name: Choose a new master for those replicas (first remaining)
  ansible.builtin.set_fact:
    new_master_for_replicas: "{{ remaining_master_ids[0] }}"

- name: Repoint each replica to a remaining master
  ansible.builtin.command: >
    valkey-cli -h {{ (item.split()[1].split(':')[0]) }}
    -p {{ (item.split()[1].split(':')[1].split('@')[0]) }}
    CLUSTER REPLICATE {{ new_master_for_replicas }}
  loop: "{{ replicas_of_source }}"
  loop_control:
    label: "{{ item.split()[1] }}"
  when: replicas_of_source | length > 0
  register: repoint_out

# ---- Delete master ----
- name: Delete the master node
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ source_id }}
  register: del_out

- name: Show delete output
  ansible.builtin.debug:
    var: del_out.stdout

Why this is “best balance”

Instead of moving all slots to one master, it:

computes a fair distribution

performs multiple reshard passes

ends with remaining masters receiving roughly equal slot additions

One practical caution

If you remove multiple masters, the cluster layout changes after each removal. This playbook already re-reads CLUSTER NODES per target, so it stays correct.

If you want to go one step further (best practice), I can add:

“pick destination masters by current slot load” (even better balance than round-robin)

guardrails for cluster_state:ok

retries/backoff for transient reshard failures

now for this pick destination masters by current slot load

Yep — this is the “best” version: choose destinations by current slot load, so you push slots to the least-loaded masters first (instead of round-robin).

Below are (1) the dynamic steps, then (2) the updated Ansible task file that implements it.

Steps: pick destination masters by current slot load

For the master you’re removing:

Run CLUSTER NODES from a seed.

Identify:

source_id (master to remove)

all other masters = candidates

For each candidate master, compute its current slot count from slot ranges in its CLUSTER NODES line.

Sort candidate masters by slot count ascending (least loaded first).

Build a move plan that spreads source_slots_total across candidates:

base = source_slots_total // K

rem = source_slots_total % K

first rem (least loaded) get base+1, rest get base

Execute reshard in K passes using --cluster-to <dest_id> and --cluster-slots <count>.

This gives you a “water-filling” style balance (better than round robin).

Ansible: improved destination selection by current slot load

Replace the “remaining_master_ids / move_plan” section in your tasks/remove_master_balanced.yml with this version (full task file shown for clarity).

tasks/remove_master_balanced_by_load.yml
---
# Input:
#   target_master = "ip:port"
# Vars required:
#   seed_host, seed_port

- name: Read cluster nodes
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: cluster_nodes
  changed_when: false

- name: Find target line
  ansible.builtin.set_fact:
    target_line: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', target_master)
          | list
          | first) | default('')
      }}

- name: Fail if target not found
  ansible.builtin.fail:
    msg: "Target master {{ target_master }} not found via seed {{ seed_host }}:{{ seed_port }}"
  when: target_line == ''

- name: Ensure target is a master
  ansible.builtin.fail:
    msg: "Target {{ target_master }} is not a master (line={{ target_line }})"
  when: "' master ' not in (' ' ~ target_line ~ ' ')"

- name: Parse source master id and slot tokens
  ansible.builtin.set_fact:
    source_id: "{{ target_line.split()[0] }}"
    source_slot_tokens: "{{ target_line.split()[8:] if (target_line.split() | length) > 8 else [] }}"

- name: Compute slots owned by source (best-effort)
  ansible.builtin.set_fact:
    source_slots_total: >-
      {%- set total = 0 -%}
      {%- for r in source_slot_tokens -%}
      {%- if '-' in r -%}
      {%- set a = (r.split('-')[0] | int) -%}
      {%- set b = (r.split('-')[1] | int) -%}
      {%- set total = total + (b - a + 1) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ total }}

# -----------------------------
# Build master load map
# -----------------------------
- name: Collect candidate master lines (exclude source)
  ansible.builtin.set_fact:
    candidate_master_lines: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', ' master ')
          | reject('search', '^' ~ source_id)
          | list)
      }}

- name: Fail if no remaining masters
  ansible.builtin.fail:
    msg: "Cannot remove {{ target_master }}; it is the last master."
  when: candidate_master_lines | length == 0

- name: Build list of [master_id, current_slot_count]
  ansible.builtin.set_fact:
    masters_with_load: >-
      {%- set out = [] -%}
      {%- for line in candidate_master_lines -%}
      {%- set parts = line.split() -%}
      {%- set mid = parts[0] -%}
      {%- set tokens = parts[8:] if (parts | length) > 8 else [] -%}
      {%- set total = 0 -%}
      {%- for r in tokens -%}
      {%- if '-' in r -%}
      {%- set a = (r.split('-')[0] | int) -%}
      {%- set b = (r.split('-')[1] | int) -%}
      {%- set total = total + (b - a + 1) -%}
      {%- endif -%}
      {%- endfor -%}
      {%- set _ = out.append([mid, total]) -%}
      {%- endfor -%}
      {{ out }}

- name: Sort destination masters by least-loaded first
  ansible.builtin.set_fact:
    dest_masters_sorted: "{{ masters_with_load | sort(attribute=1) | map('first') | list }}"
    dest_loads_sorted: "{{ masters_with_load | sort(attribute=1) | list }}"

# -----------------------------
# Build slot move plan using least-loaded order
# -----------------------------
- name: Build balanced move plan across least-loaded masters
  ansible.builtin.set_fact:
    k: "{{ dest_masters_sorted | length }}"
    base: "{{ (source_slots_total | int) // (dest_masters_sorted | length) }}"
    rem: "{{ (source_slots_total | int) % (dest_masters_sorted | length) }}"
    move_plan: >-
      {%- set plan = [] -%}
      {%- for i in range(0, k | int) -%}
      {%- set slots = (base | int) + (1 if i < (rem | int) else 0) -%}
      {%- if slots > 0 -%}
      {%- set _ = plan.append([dest_masters_sorted[i], slots]) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ plan }}

- name: Debug plan (load-aware)
  ansible.builtin.debug:
    msg:
      - "Removing master {{ target_master }} node-id={{ source_id }}"
      - "Source slots={{ source_slots_total }}"
      - "Dest masters by load (id,slots)={{ dest_loads_sorted }}"
      - "Move plan (dest_id,slots_to_move)={{ move_plan }}"

# -----------------------------
# Reshard passes
# -----------------------------
- name: Reshard pass: move planned slots from source to least-loaded masters
  ansible.builtin.command: >
    valkey-cli --cluster reshard {{ seed_host }}:{{ seed_port }}
    --cluster-from {{ source_id }}
    --cluster-to {{ item[0] }}
    --cluster-slots {{ item[1] }}
    --cluster-yes
  loop: "{{ move_plan }}"
  loop_control:
    label: "to={{ item[0] }} slots={{ item[1] }}"
  when: (source_slots_total | int) > 0
  register: reshard_results

# -----------------------------
# Verify source empty, repoint replicas, delete
# -----------------------------
- name: Re-read cluster nodes after reshard
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: nodes_after
  changed_when: false

- name: Get source line after
  ansible.builtin.set_fact:
    source_line_after: >-
      {{
        (nodes_after.stdout_lines
          | select('search', '^' ~ source_id)
          | list
          | first) | default('')
      }}

- name: Fail if source still owns slots
  ansible.builtin.fail:
    msg: "Source master still appears to own slots: {{ source_line_after }}"
  when: >
    (source_slots_total | int) > 0 and
    (source_line_after != '') and
    (
      (source_line_after.split() | length) > 8 and
      (source_line_after.split()[8:] | select('search','-') | list | length) > 0
    )

- name: Find replicas pointing to source
  ansible.builtin.set_fact:
    replicas_of_source: >-
      {{
        (nodes_after.stdout_lines
          | select('search', 'slave ' ~ source_id)
          | list)
      }}

- name: Choose new master for replicas (least-loaded destination)
  ansible.builtin.set_fact:
    new_master_for_replicas: "{{ dest_masters_sorted[0] }}"

- name: Repoint each replica to a remaining master
  ansible.builtin.command: >
    valkey-cli -h {{ (item.split()[1].split(':')[0]) }}
    -p {{ (item.split()[1].split(':')[1].split('@')[0]) }}
    CLUSTER REPLICATE {{ new_master_for_replicas }}
  loop: "{{ replicas_of_source }}"
  loop_control:
    label: "{{ item.split()[1] }}"
  when: replicas_of_source | length > 0

- name: Delete the master node
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ source_id }}
  register: del_out

- name: Show delete output
  ansible.builtin.debug:
    var: del_out.stdout

Playbook call

In your main playbook, just include this task file instead of the older one:

- include_tasks: tasks/remove_master_balanced_by_load.yml
  loop: "{{ masters_to_remove }}"
  loop_control:
    loop_var: target_master

One more improvement (optional but recommended)

After you finish removing multiple masters, run a final:

valkey-cli --cluster rebalance <seed_ip:port> --cluster-yes


That does a global rebalance across all masters.

If you want, I’ll add that as a final Ansible task (run_once) after the loop.

give this approach..single master (fastest)

Here’s the single-destination master (fastest) approach to remove a master dynamically. This moves all slots from the master being removed to ONE chosen destination master, then deletes the node.

Fastest dynamic steps (single destination master)
1) Pick a seed node

Any healthy node:

seed = <ip:port>

2) Discover the node-id + slot ownership of the master to remove
valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES


Find the line that matches <remove_ip>:<remove_port> and extract:

source_master_id (first column)

slot ranges at end (e.g. 0-5460 5461-10922)

Compute:

slots_to_move = sum((end-start+1) for each range)

3) Pick ONE destination master dynamically

From the same CLUSTER NODES output, pick any other master node-id:

simplest: first master line that is not the source

Call that:

dest_master_id

4) Move all slots off the master (single pass)
valkey-cli --cluster reshard <seed_ip:seed_port> \
  --cluster-from <source_master_id> \
  --cluster-to <dest_master_id> \
  --cluster-slots <slots_to_move> \
  --cluster-yes

5) Verify source owns 0 slots
valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES


Source master line should have no slot ranges at the end.

6) Repoint replicas that were attached to the removed master (recommended)

For each replica that shows slave <source_master_id> in CLUSTER NODES:

On that replica node:

valkey-cli -h <replica_ip> -p <replica_port> CLUSTER REPLICATE <dest_master_id>

7) Delete the master
valkey-cli --cluster del-node <seed_ip:seed_port> <source_master_id>

8) Post-checks
valkey-cli -h <seed_ip> -p <seed_port> CLUSTER INFO
valkey-cli -h <seed_ip> -p <seed_port> CLUSTER NODES

Why this is fastest

Only one reshard command

No slot planning / multi-pass

Works great when you’re shrinking quickly (you can rebalance later if needed)

Ansible task snippet (fastest)

If you want it as a single include-task (like your earlier ones), tell me:

do you pass nodes as ["ip:port", ...]?

should the destination master be first remaining master or a specific one you pass in?

I can paste the exact task file in the same style as your current automation.

a specific one you pass in

Below is the fastest “single destination master” removal, where you pass the destination master explicitly. It works for a list of nodes (masters or replicas). For masters: it reshards all slots to your chosen destination master, repoints replicas, then deletes the node.

Playbook: remove_nodes_to_specific_master.yml
---
- name: Remove Valkey nodes, reshard masters to a specific destination master
  hosts: localhost
  gather_facts: false

  vars:
    seed_host: "10.0.0.11"
    seed_port: 7000

    # Nodes user wants to remove (ip:port)
    nodes_to_remove:
      - "10.0.0.15:7000"
      - "10.0.0.16:7000"

    # Destination master (ip:port) that will RECEIVE all slots from removed masters
    dest_master_endpoint: "10.0.0.12:7000"

  tasks:
    - name: Validate inputs
      ansible.builtin.assert:
        that:
          - nodes_to_remove is iterable
          - nodes_to_remove | length > 0
          - dest_master_endpoint is string
          - ":" in dest_master_endpoint
        fail_msg: "Provide nodes_to_remove list and dest_master_endpoint like '10.0.0.12:7000'."

    - name: Remove each node safely (master/replica)
      ansible.builtin.include_tasks: tasks/remove_one_node_to_specific_master.yml
      loop: "{{ nodes_to_remove }}"
      loop_control:
        loop_var: target_node

Task file: tasks/remove_one_node_to_specific_master.yml
---
# Inputs:
#   target_node (ip:port)
# Vars:
#   seed_host, seed_port, dest_master_endpoint

- name: Read cluster nodes from seed
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  register: cluster_nodes
  changed_when: false

- name: Find target line
  ansible.builtin.set_fact:
    target_line: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', target_node)
          | list
          | first) | default('')
      }}

- name: Fail if target not found
  ansible.builtin.fail:
    msg: "Target {{ target_node }} not found in CLUSTER NODES via seed {{ seed_host }}:{{ seed_port }}"
  when: target_line == ''

- name: Parse target node-id and role
  ansible.builtin.set_fact:
    target_node_id: "{{ target_line.split()[0] }}"
    target_is_master: "{{ ' master ' in (' ' ~ target_line ~ ' ') }}"
    target_is_replica: "{{ (' slave ' in (' ' ~ target_line ~ ' ')) or (' replica ' in (' ' ~ target_line ~ ' ')) }}"
    target_slot_tokens: "{{ target_line.split()[8:] if (target_line.split() | length) > 8 else [] }}"

# ---- destination master validation ----
- name: Find destination master line
  ansible.builtin.set_fact:
    dest_line: >-
      {{
        (cluster_nodes.stdout_lines
          | select('search', dest_master_endpoint)
          | list
          | first) | default('')
      }}

- name: Fail if destination master not found
  ansible.builtin.fail:
    msg: "Destination {{ dest_master_endpoint }} not found in CLUSTER NODES (seed={{ seed_host }}:{{ seed_port }})"
  when: dest_line == ''

- name: Ensure destination is a master
  ansible.builtin.fail:
    msg: "Destination {{ dest_master_endpoint }} is not a master (line={{ dest_line }})"
  when: "' master ' not in (' ' ~ dest_line ~ ' ')"

- name: Parse destination master node-id
  ansible.builtin.set_fact:
    dest_master_id: "{{ dest_line.split()[0] }}"

- name: Fail if destination master equals target master
  ansible.builtin.fail:
    msg: "Target {{ target_node }} is the same as destination master {{ dest_master_endpoint }}. Choose a different dest."
  when: target_node_id == dest_master_id

# ---- If replica: del-node ----
- name: Delete replica node
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ target_node_id }}
  when: target_is_replica
  register: del_replica

# ---- If master: compute slots, reshard ALL to dest, repoint replicas, del-node ----
- name: Compute slots owned by target master (best-effort)
  ansible.builtin.set_fact:
    target_slots_count: >-
      {%- set total = 0 -%}
      {%- for r in target_slot_tokens -%}
      {%- if '-' in r -%}
      {%- set a = (r.split('-')[0] | int) -%}
      {%- set b = (r.split('-')[1] | int) -%}
      {%- set total = total + (b - a + 1) -%}
      {%- endif -%}
      {%- endfor -%}
      {{ total }}
  when: target_is_master

- name: Reshard ALL slots from target master to destination master
  ansible.builtin.command: >
    valkey-cli --cluster reshard {{ seed_host }}:{{ seed_port }}
    --cluster-from {{ target_node_id }}
    --cluster-to {{ dest_master_id }}
    --cluster-slots {{ target_slots_count | int }}
    --cluster-yes
  when: target_is_master and (target_slots_count | int > 0)
  register: reshard_out

- name: Re-read cluster nodes after reshard
  ansible.builtin.command: >
    valkey-cli -h {{ seed_host }} -p {{ seed_port }} CLUSTER NODES
  when: target_is_master
  register: nodes_after
  changed_when: false

- name: Find replicas pointing to removed master
  ansible.builtin.set_fact:
    replicas_of_target: >-
      {{
        (nodes_after.stdout_lines
          | select('search', 'slave ' ~ target_node_id)
          | list)
      }}
  when: target_is_master

- name: Repoint each replica to destination master
  ansible.builtin.command: >
    valkey-cli -h {{ (item.split()[1].split(':')[0]) }}
    -p {{ (item.split()[1].split(':')[1].split('@')[0]) }}
    CLUSTER REPLICATE {{ dest_master_id }}
  loop: "{{ replicas_of_target | default([]) }}"
  loop_control:
    label: "{{ item.split()[1] }}"
  when: target_is_master and (replicas_of_target | default([]) | length > 0)

- name: Delete master node (after slots moved)
  ansible.builtin.command: >
    valkey-cli --cluster del-node {{ seed_host }}:{{ seed_port }} {{ target_node_id }}
  when: target_is_master
  register: del_master

- name: Summary
  ansible.builtin.debug:
    msg:
      - "Target={{ target_node }}"
      - "Role={{ 'master' if target_is_master else 'replica' }}"
      - "TargetNodeId={{ target_node_id }}"
      - "Destination={{ dest_master_endpoint }} (id={{ dest_master_id }})"
      - "SlotsMoved={{ target_slots_count | default(0) }}"

Run
ansible-playbook remove_nodes_to_specific_master.yml \
  -e seed_host=10.0.0.11 -e seed_port=7000 \
  -e 'nodes_to_remove=["10.0.0.15:7000","10.0.0.16:7000"]' \
  -e dest_master_endpoint=10.0.0.12:7000

Notes

This is the fastest method (single reshard per master).

It may unbalance slot distribution (since everything lands on one master). If you want, add a final optional step:

valkey-cli --cluster rebalance <seed_ip:port> --cluster-yes

==================================================================================================Approaches Summary ==================================================
(I can add that as a run_once Ansible task.)

If you want this to also support remove_port per node (mixed ports) or TLS/auth, tell me what you use and I’ll adjust the commands.

so there are 3 approaches - 1. round robin - where redistribute to other masters 2. all slots from the master being removed to ONE chosen destination master 3. choose destinations by current slot load, so you push slots to the least-loaded masters first

Yes — that’s exactly the 3 practical approaches, and they map nicely to speed vs balance tradeoffs:

1) Round-robin redistribution across remaining masters

What it does: split the slots you’re moving across all remaining masters in a simple rotating order (no “load” awareness).

Pros: simple, reasonably balanced, deterministic, easy to automate.

Cons: not optimal if masters are already uneven (can make imbalance worse).

Best for: fast automation when your cluster is usually already balanced.

Mechanic: multi-pass reshard where each pass targets the next master in the list.

2) Single destination master (fastest)

What it does: move all slots from the master being removed to one master (the one you choose/pin).

Pros: fastest (one reshard command per removed master), easiest to reason about, good for emergency shrink.

Cons: can heavily unbalance the cluster; you usually want a later rebalance.

Best for: “just get this node out now” scenarios, maintenance windows, or when you’ll rebalance afterward.

Mechanic: one valkey-cli --cluster reshard ... --cluster-to <dest> --cluster-slots <all>.

3) Least-loaded destinations (best balance)

What it does: compute current slot counts of remaining masters; send more of the moved slots to the least-loaded masters first.

Pros: best immediate balance; avoids concentrating load.

Cons: slightly more logic/compute + multiple reshard passes.

Best for: production shrink with minimal post-work and best steady-state.

Mechanic: parse CLUSTER NODES → slot counts → sort masters by slots → build plan → multi-pass reshard.

Quick rule of thumb

If you care most about speed: #2

If you care most about balance: #3

If you want simple + good enough: #1

If you want, I can also add a “hybrid”:

Use #2 for speed, then run a final valkey-cli --cluster rebalance <seed> --cluster-yes to restore balance automatically.
==================================================================================================================================Option 4 Hybrid======================
yes hybrid

Hybrid = fast removal (single-destination reshard) + an optional final rebalance to spread slots evenly again.

Hybrid steps
1) Pick:

seed = <any healthy node ip:port>

dest_master = <specific master ip:port> (temporary sink)

2) For each node to remove

If replica: delete it

valkey-cli --cluster del-node <seed> <replica_node_id>


If master:

Move all its slots to the destination master (fastest)

valkey-cli --cluster reshard <seed> \
  --cluster-from <source_master_id> \
  --cluster-to <dest_master_id> \
  --cluster-slots <slots_to_move> \
  --cluster-yes


Repoint replicas of the removed master to dest_master_id (recommended)

valkey-cli -h <replica_ip> -p <replica_port> CLUSTER REPLICATE <dest_master_id>


Delete the master

valkey-cli --cluster del-node <seed> <source_master_id>

3) After all removals, run global rebalance

This is what restores an even distribution across all remaining masters:

valkey-cli --cluster rebalance <seed> --cluster-yes


Optional knobs (use if you want to be conservative):

--cluster-use-empty-masters (if you just added empty masters and want them to receive slots)

--cluster-weight <node_id>=<weight> (advanced)

Hybrid Ansible add-on (final rebalance)

If you’re using the “specific destination master” Ansible approach we wrote earlier, add this after the loop (run once):

- name: Rebalance cluster after removals (hybrid)
  ansible.builtin.command: >
    valkey-cli --cluster rebalance {{ seed_host }}:{{ seed_port }} --cluster-yes
  run_once: true


That’s it.

When hybrid is the best choice

You need fast, predictable removals

You still want the cluster to end up balanced

You’re okay with a short “rebalance phase” after the shrink

If you tell me your typical master count (3? 6? 12?) and whether you want to limit how much data moves during rebalance, I can add conservative settings (so rebalance doesn’t churn too much).
=================================




