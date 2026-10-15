def findDuplicates(leads):
    connections = {}
    phone_map = {}
    email_map = {}

    for lead in leads:
        lead_id = lead[0]
        connections[lead_id] = set()

    for lead in leads:
        lead_id = lead[0]
        phone = lead[2]
        email = lead[3]
        
        # CLEAN PHONE: remove spaces, dashes, and brackets, keep last 10
        clean_phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        clean_phone = clean_phone[-10:]
        
        # CLEAN EMAIL: trim spaces and lowercase
        clean_email = email.strip().lower()
        
        # MATCH PHONES
        if clean_phone in phone_map:
            for other_id in phone_map[clean_phone]:
                # Tie them together!
                connections[lead_id].add(other_id)
                connections[other_id].add(lead_id)
            phone_map[clean_phone].append(lead_id)
        else:
            phone_map[clean_phone] = [lead_id]
            
        # MATCH EMAILS
        if clean_email in email_map:
            for other_id in email_map[clean_email]:
                connections[lead_id].add(other_id)
                connections[other_id].add(lead_id)
            email_map[clean_email].append(lead_id)
        else:
            email_map[clean_email] = [lead_id]

    visited = set() 
    duplicate_groups = []
    
    for lead_id in connections:
        if lead_id not in visited:
            group = []
            stack = [lead_id]
            
            while stack:
                current_id = stack.pop()
                if current_id not in visited:
                    visited.add(current_id)
                    group.append(current_id)
                    
                    for neighbor_id in connections[current_id]:
                        if neighbor_id not in visited:
                            stack.append(neighbor_id)
                            
            if len(group) >= 2:
                group.sort() 
                duplicate_groups.append(group)
                
    duplicate_groups.sort(key=lambda x: x[0])
    return duplicate_groups


leads_input = [
    [1, "Rahul",   "+91 98200-12345", "rahul@gmail.com"],
    [2, "Rahul S", "09820012345",     "rahul.s@yahoo.com"],
    [3, "R Sharma","9930011122",      "Rahul.S@Yahoo.com"],
    [4, "Priya",   "98201 12345",     "priya@techsperia.com"],
    [5, "Priya K", "+919820112345",   "priyak@gmail.com"],
    [6, "Amit",    "9000000000",      "amit@x.com"]
]

print(findDuplicates(leads_input))