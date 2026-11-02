#[cfg(test)]
mod tests {
    use super::*;
    fn windows() -> Vec<String> {
        vec!["main".into(), "slate-1".into()]
    }
    #[test]
    fn requires_every_clean_ack_and_commits_only_once() {
        let mut g = Guard::default();
        let id = g.begin(windows()).unwrap();
        assert!(g.begin(windows()).is_none());
        g.ack(id, "main", false, 0);
        assert!(!g.commit(&windows()));
        g.ack(id, "slate-1", false, 0);
        assert!(g.commit(&windows()));
        assert!(!g.commit(&windows()));
    }
    #[test]
    fn dirty_pending_stale_missing_and_membership_changes_fail_closed() {
        for (dirty, pending) in [(true, 0), (false, 1)] {
            let mut g = Guard::default();
            let id = g.begin(windows()).unwrap();
            g.ack(id, "main", false, 0);
            g.ack(id, "slate-1", dirty, pending);
            assert!(!g.commit(&windows()));
        }
        let mut g = Guard::default();
        let id = g.begin(windows()).unwrap();
        g.ack(id - 1, "main", false, 0);
        g.ack(id, "slate-1", false, 0);
        assert!(!g.commit(&windows()));
        g.ack(id, "main", false, 0);
        assert!(!g.commit(&["main".into()]));
        g.abort();
        assert!(!g.frozen());
        assert!(g.begin(windows()).is_some());
    }
}
use std::collections::{BTreeSet, HashSet};

#[derive(Default)]
pub struct Guard {
    pub attempt: u64,
    pub preparing: bool,
    pub committed: bool,
    expected: BTreeSet<String>,
    acknowledgments: HashSet<String>,
    pub failed: bool,
}
impl Guard {
    pub fn frozen(&self) -> bool {
        self.preparing || self.committed
    }
    pub fn begin(&mut self, windows: Vec<String>) -> Option<u64> {
        if self.frozen() {
            return None;
        }
        self.attempt += 1;
        self.preparing = true;
        self.failed = false;
        self.expected = windows.into_iter().collect();
        self.acknowledgments.clear();
        Some(self.attempt)
    }
    pub fn ack(&mut self, id: u64, label: &str, dirty: bool, pending: u32) {
        if !self.preparing || id != self.attempt || !self.expected.contains(label) {
            return;
        }
        if dirty || pending > 0 {
            self.failed = true;
        }
        self.acknowledgments.insert(label.into());
    }
    pub fn ready(&self) -> bool {
        self.preparing
            && !self.failed
            && !self.expected.is_empty()
            && self.acknowledgments.len() == self.expected.len()
    }
    pub fn commit(&mut self, windows: &[String]) -> bool {
        if !self.ready() || self.expected != windows.iter().cloned().collect() {
            return false;
        }
        self.preparing = false;
        self.committed = true;
        true
    }
    pub fn abort(&mut self) {
        self.preparing = false;
        self.committed = false;
        self.acknowledgments.clear();
    }
}
