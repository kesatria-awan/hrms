-- Rename board member role from "viewer" to "member"
UPDATE board_members SET role = 'member' WHERE role = 'viewer';
