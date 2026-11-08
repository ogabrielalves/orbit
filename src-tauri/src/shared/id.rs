use uuid::Uuid;

pub fn new_id() -> String {
    Uuid::now_v7().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_uuid_version_seven() {
        let id = Uuid::parse_str(&new_id()).expect("valid uuid");

        assert_eq!(id.get_version_num(), 7);
    }

    #[test]
    fn generates_unique_ids() {
        let mut ids: Vec<String> = (0..1000).map(|_| new_id()).collect();
        ids.sort();
        ids.dedup();

        assert_eq!(ids.len(), 1000);
    }

    #[test]
    fn generates_ids_in_creation_order() {
        let ids: Vec<String> = (0..1000).map(|_| new_id()).collect();
        let mut sorted = ids.clone();
        sorted.sort();

        assert_eq!(ids, sorted);
    }
}
