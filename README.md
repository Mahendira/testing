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
  



