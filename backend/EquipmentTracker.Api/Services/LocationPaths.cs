using EquipmentTracker.Api.Models;

namespace EquipmentTracker.Api.Services;

// Пути в иерархии локаций (единая таблица Locations с ParentLocationId)
public static class LocationPaths
{
    // Полная цепочка локаций от корня до данной (включительно)
    public static List<Location> AncestorChain(int locationId, Dictionary<int, Location> byId)
    {
        var chain = new List<Location>();
        if (!byId.TryGetValue(locationId, out var cur)) return chain;
        while (true)
        {
            chain.Insert(0, cur);
            if (cur.ParentLocationId is null || !byId.TryGetValue(cur.ParentLocationId.Value, out var parent)) break;
            cur = parent;
        }
        return chain;
    }

    public static string FullPath(int locationId, Dictionary<int, Location> byId) =>
        string.Join(" → ", AncestorChain(locationId, byId).Select(l => l.Name));

    // Идентификаторы всех локаций поддерева (сами корни + все вложенные на любую глубину)
    public static HashSet<int> Subtree(IEnumerable<int> rootIds, IEnumerable<Location> all)
    {
        var childrenByParent = all
            .Where(l => l.ParentLocationId is not null)
            .GroupBy(l => l.ParentLocationId!.Value)
            .ToDictionary(g => g.Key, g => g.Select(l => l.Id).ToList());

        var result = new HashSet<int>();
        var stack = new Stack<int>(rootIds);
        while (stack.Count > 0)
        {
            var id = stack.Pop();
            if (!result.Add(id)) continue;
            if (childrenByParent.TryGetValue(id, out var kids))
                foreach (var kid in kids) stack.Push(kid);
        }
        return result;
    }
}
