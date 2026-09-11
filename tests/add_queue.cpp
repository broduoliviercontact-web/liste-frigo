#include "ListeFrigoAddQueue.h"
#include <cassert>
#include <cstdio>
int main() {
 DurableAdds q; DurableAdd a; strcpy(a.key,"first-key"); strcpy(a.label,"lait"); a.list_id=1; a.created_at=1000;
 assert(q.append(a)); strcpy(a.key,"second-key"); assert(q.append(a));
 DurableAdds reboot; memcpy(&reboot,&q,sizeof(q));
 assert(reboot.count==2); assert(strcmp(reboot.entries[0].key,"first-key")==0);
 reboot.entries[0].attempts++; assert(strcmp(reboot.entries[0].key,"first-key")==0);
 reboot.remove(0); assert(reboot.count==1); assert(strcmp(reboot.entries[0].key,"second-key")==0);
 for(int i=0;i<7;i++) assert(reboot.append(a)); assert(!reboot.append(a));
 assert(!addExpired(1000,1000+86400000-1)); assert(addExpired(1000,1000+86400000)); assert(addExpired(1000,999));
 puts("add queue: distinct intents, stable retry keys, serialized recovery, capacity and TTL OK");
}
