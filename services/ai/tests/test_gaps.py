"""Unit tests for online gap clustering. DB ops are injected — no live DB."""

from app.gaps import assign_cluster, _incremental_mean


def test_incremental_mean_folds_one_member():
    # centroid [0,0] with count 1, fold in [2,2] -> mean [1,1]
    assert _incremental_mean([0.0, 0.0], 1, [2.0, 2.0]) == [1.0, 1.0]


def test_match_within_radius_updates_existing_cluster():
    updated = {}
    inserted = {"called": False}

    def search(_embedding):
        return {"id": "c1", "distance": 0.10, "count": 2, "centroid": [0.0, 0.0]}

    def update(cluster_id, new_centroid):
        updated["id"] = cluster_id
        updated["centroid"] = new_centroid

    def insert(_embedding, _query):
        inserted["called"] = True
        return "new"

    cluster_id = assign_cluster(
        [3.0, 3.0], "q",
        search_fn=search, update_fn=update, insert_fn=insert, radius=0.15,
    )

    assert cluster_id == "c1"
    assert inserted["called"] is False
    assert updated["id"] == "c1"
    # new centroid = (0*2 + 3)/3 = 1.0 for each dim
    assert updated["centroid"] == [1.0, 1.0]


def test_outside_radius_creates_new_cluster():
    def search(_embedding):
        return {"id": "c1", "distance": 0.40, "count": 1, "centroid": [0.0, 0.0]}

    def insert(_embedding, query):
        assert query == "q"
        return "new-cluster"

    def update(*_args):
        raise AssertionError("should not update when outside radius")

    cluster_id = assign_cluster(
        [9.0, 9.0], "q",
        search_fn=search, update_fn=update, insert_fn=insert, radius=0.15,
    )
    assert cluster_id == "new-cluster"


def test_no_existing_cluster_creates_new():
    def search(_embedding):
        return None

    def insert(_embedding, _query):
        return "first-cluster"

    def update(*_args):
        raise AssertionError("no cluster to update")

    assert assign_cluster([1.0], "q", search_fn=search, update_fn=update, insert_fn=insert, radius=0.15) == "first-cluster"
